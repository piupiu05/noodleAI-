
'use strict';

if (!window.noodleBLE || !window.NoodleAIBLE) {
  throw new Error('NoodleAI BLE runtime did not load. Hard-refresh and verify js/ble.js is published.');
}


const $=id=>document.getElementById(id);
const REP_LABEL={accel:'Accelerometer',gyro:'Gyroscope','accel+gyro':'Accel + Gyro',quaternion:'Relative Quaternion',velocity:'Estimated Velocity','velocity+quaternion':'Velocity + Quaternion'};
const state={
  labels:[],samples:[],rawSamples:[],targets:[],rawLengths:[],durationsMs:[],N:100,setupLocked:false,
  pendingRaw:null,pendingWindow:null,pendingLabelIndex:null,pendingDurationMs:0,pendingGestureEnd:null,recording:null,
  model:null,scaler:null,pkg:null,history:null,trainedRep:null,deviceMode:'?',
  live:{t:[],accel:[[],[],[]],gyro:[[],[],[]]},
};

function log(msg){const t=new Date().toLocaleTimeString();$('log').textContent+=`[${t}] ${msg}\n`;$('log').scrollTop=$('log').scrollHeight;}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function pct(v){return `${(100*v).toFixed(1)}%`;}
function setBootStatus(text,active=false){const el=$('bootStatus');if(el)el.textContent=text;const box=el?.closest('.boot-reading');if(box)box.classList.toggle('active',!!active);}
function switchTab(name){document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));document.querySelectorAll('.tab-page').forEach(p=>p.classList.toggle('active',p.id===`tab-${name}`));}

document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));

async function initTf(){try{await tf.setBackend('cpu');await tf.ready();$('tfBadge').textContent=`TF.js ${tf.version.tfjs} · ${tf.getBackend()}`;log(`TensorFlow.js ${tf.version.tfjs} ready (${tf.getBackend()}).`);}catch(e){$('tfBadge').textContent='TensorFlow.js unavailable';log(`TensorFlow.js ERROR: ${e.message}`);}}

function datasetObject(){
  const n=state.targets.length;
  return {Xrows:state.samples,y:Int32Array.from(state.targets),labels:[...state.labels],N:state.N,sampleRate:NAI.SAMPLE_RATE_HZ,
    rawRows:state.rawSamples.length===n&&n?state.rawSamples:null,width:state.N*6,rawLengths:[...state.rawLengths],durationsMs:[...state.durationsMs]};
}

function parseHidden(){const h=$('hiddenLayers').value.split(',').map(s=>s.trim()).filter(Boolean).map(Number);if(!h.length||h.some(v=>!Number.isInteger(v)||v<1||v>512))throw new Error('Hidden layers must be comma-separated integers from 1 to 512.');return h;}

function selectedRep(){return $('representation').value;}
function updateInputAndTopology(){
  state.N=Math.max(5,Math.min(500,Number($('normalizedLength').value)||100));
  const rep=selectedRep(),D=state.N*NAI.REP[rep].channels;
  $('inputDimSummary').textContent=`${state.N} × ${NAI.REP[rep].channels} = ${D}`;
  try{$('topology').textContent=`Topology: ${[D,...parseHidden(),Math.max(state.labels.length,0)].join(' → ')}  [${REP_LABEL[rep]}]`;}catch(e){$('topology').textContent=`Topology: ${e.message}`;}
}

function refreshLabels(){
  $('labelList').innerHTML='';$('recordLabel').innerHTML='';
  state.labels.forEach((label,i)=>{const a=document.createElement('option');a.value=String(i);a.textContent=label;$('labelList').appendChild(a);const b=a.cloneNode(true);$('recordLabel').appendChild(b);});
  $('classCount').textContent=String(state.labels.length);
  updateInputAndTopology();
}

function refreshDataset(){
  const n=state.targets.length;$('sampleCount').textContent=String(n);$('saveDatasetBtn').disabled=!n;
  $('rawDatasetStatus').textContent=n===0?'—':state.rawSamples.length===n?'available':'legacy only';
  const counts=Array(state.labels.length).fill(0);state.targets.forEach(y=>{if(y>=0&&y<counts.length)counts[y]++;});
  $('classCounts').innerHTML='';counts.forEach((c,i)=>{const s=document.createElement('span');s.className='class-pill';s.textContent=`${state.labels[i]}: ${c}`;$('classCounts').appendChild(s);});
  $('trainBtn').disabled=!(state.setupLocked&&n>0);
}

function invalidateModel(){if(state.model){try{state.model.dispose();}catch(_){}}state.model=null;state.scaler=null;state.pkg=null;state.history=null;state.trainedRep=null;$('saveModelBtn').disabled=true;$('deployBtn').disabled=true;$('trainResult').textContent='';$('curveSummary').textContent='Train a model to see loss and accuracy history.';drawTrainingCurves();}

function lockUi(locked){
  state.setupLocked=locked;$('normalizedLength').disabled=locked;$('labelEntry').disabled=locked;$('addLabelBtn').disabled=locked;$('removeLabelBtn').disabled=locked;$('lockSetupBtn').disabled=locked;
  $('recordLabel').disabled=!locked;$('armRecordBtn').disabled=!(locked&&window.noodleBLE.connected);$('trainBtn').disabled=!(locked&&state.targets.length);
}

function resetDataset(confirmFirst=true){
  if(confirmFirst&&(state.targets.length||state.setupLocked)&&!confirm('Clear all recorded samples and unlock the dataset setup?'))return;
  state.labels=[];state.samples=[];state.rawSamples=[];state.targets=[];state.rawLengths=[];state.durationsMs=[];state.pendingRaw=null;state.pendingWindow=null;state.pendingLabelIndex=null;state.recording=null;state.pendingGestureEnd=null;state.N=Number($('normalizedLength').value)||100;
  invalidateModel();lockUi(false);refreshLabels();refreshDataset();$('recordProgress').textContent='Define labels and lock setup first.';$('saveSampleBtn').disabled=true;$('discardSampleBtn').disabled=true;
}

$('addLabelBtn').addEventListener('click',()=>{if(state.setupLocked)return;const label=$('labelEntry').value.trim();if(!label)return;if(state.labels.includes(label)){alert('That label already exists.');return;}state.labels.push(label);$('labelEntry').value='';refreshLabels();});
$('labelEntry').addEventListener('keydown',e=>{if(e.key==='Enter'){$('addLabelBtn').click();e.preventDefault();}});
$('removeLabelBtn').addEventListener('click',()=>{if(state.setupLocked)return;const i=$('labelList').selectedIndex;if(i>=0){state.labels.splice(i,1);refreshLabels();}});
$('normalizedLength').addEventListener('input',updateInputAndTopology);$('representation').addEventListener('change',updateInputAndTopology);$('hiddenLayers').addEventListener('input',updateInputAndTopology);

$('lockSetupBtn').addEventListener('click',()=>{const N=Number($('normalizedLength').value);if(!Number.isInteger(N)||N<5||N>500){alert('Use 5..500 normalized gesture points.');return;}if(state.labels.length<2){alert('Define at least two labels first.');return;}state.N=N;lockUi(true);refreshDataset();$('recordProgress').textContent=`Ready. Select a label, click “Use BOOT to record”, then hold BOOT while drawing.`;log(`Dataset locked: ${N} normalized points; ${state.labels.length} labels.`);});
$('resetDatasetBtn').addEventListener('click',()=>resetDataset(true));

$('armRecordBtn').addEventListener('click',async()=>{try{if(!state.setupLocked)throw new Error('Lock the dataset setup first.');if(!window.noodleBLE.connected)throw new Error('Connect the device first.');if($('recordLabel').selectedIndex<0)throw new Error('Choose a label.');await window.noodleBLE.setTraining();$('recordProgress').textContent=`Ready for “${state.labels[$('recordLabel').selectedIndex]}”: hold BOOT, draw, release BOOT.`;}catch(e){alert(e.message);}});

function beginGesture(){
  if(state.deviceMode!=='T'||!state.setupLocked)return;
  const idx=$('recordLabel').selectedIndex;if(idx<0||idx>=state.labels.length){log('Gesture started but no valid label is selected.');return;}
  state.pendingRaw=null;state.pendingWindow=null;state.pendingLabelIndex=idx;state.pendingDurationMs=0;state.pendingGestureEnd=null;state.recording=[];
  $('recordProgress').textContent=`Recording “${state.labels[idx]}” while BOOT is held…`;$('saveSampleBtn').disabled=true;$('discardSampleBtn').disabled=false;
}

function finishGestureIfReady(){
  if(!state.recording||!state.pendingGestureEnd)return;
  const {count,durationMs}=state.pendingGestureEnd;
  if(state.recording.length<count){$('recordProgress').textContent=`BOOT released; waiting for final BLE samples (${state.recording.length}/${count})…`;return;}
  const raw=new Float32Array(count*6);for(let r=0;r<count;r++)for(let c=0;c<6;c++)raw[r*6+c]=state.recording[r][c];
  state.recording=null;state.pendingGestureEnd=null;
  if(count<2){$('recordProgress').textContent='Gesture too short. Try again.';state.pendingLabelIndex=null;$('discardSampleBtn').disabled=true;return;}
  const rawObj={data:raw,length:count};state.pendingRaw=rawObj;state.pendingWindow=NAI.normalizeRawSixAxis(rawObj,state.N);state.pendingDurationMs=durationMs;
  $('recordProgress').textContent=`Captured ${count} raw samples (${(durationMs/1000).toFixed(2)} s) → normalized to ${state.N} points. Save or discard.`;$('saveSampleBtn').disabled=false;$('discardSampleBtn').disabled=false;
}

$('saveSampleBtn').addEventListener('click',()=>{if(!state.pendingRaw||!state.pendingWindow||state.pendingLabelIndex==null)return;state.samples.push(Float32Array.from(state.pendingWindow));state.rawSamples.push({data:Float32Array.from(state.pendingRaw.data),length:state.pendingRaw.length});state.targets.push(state.pendingLabelIndex);state.rawLengths.push(state.pendingRaw.length);state.durationsMs.push(state.pendingDurationMs||0);log(`Saved “${state.labels[state.pendingLabelIndex]}”: raw=${state.pendingRaw.length}, normalized=${state.N}×6.`);state.pendingRaw=null;state.pendingWindow=null;state.pendingLabelIndex=null;state.pendingDurationMs=0;$('saveSampleBtn').disabled=true;$('discardSampleBtn').disabled=true;$('recordProgress').textContent='Saved. Select a label and hold BOOT for another gesture.';invalidateModel();refreshDataset();});
$('discardSampleBtn').addEventListener('click',()=>{state.recording=null;state.pendingRaw=null;state.pendingWindow=null;state.pendingLabelIndex=null;state.pendingGestureEnd=null;$('saveSampleBtn').disabled=true;$('discardSampleBtn').disabled=true;$('recordProgress').textContent='Discarded. Hold BOOT when ready for another gesture.';});

$('saveDatasetBtn').addEventListener('click',async()=>{try{const blob=await NAI.buildDatasetNpzBlob(datasetObject());downloadBlob(blob,'noodleai_dataset.npz');log('Saved NAI4 dataset (.npz).');}catch(e){alert(e.message);}});
$('loadDatasetBtn').addEventListener('click',()=>$('datasetFile').click());
$('datasetFile').addEventListener('change',async e=>{try{const file=e.target.files[0];if(!file)return;if((state.targets.length||state.setupLocked)&&!confirm('Replace the current dataset/setup?'))return;const arrays=await NAI.loadNpz(file);const ds=NAI.parseDatasetArrays(arrays);resetDataset(false);state.N=ds.N;$('normalizedLength').value=String(ds.N);state.labels=[...ds.labels];state.samples=ds.Xrows.map(r=>Float32Array.from(r));state.targets=Array.from(ds.y,Number);state.rawSamples=ds.rawRows?ds.rawRows.map(r=>({data:Float32Array.from(r.data),length:r.length})):[];state.rawLengths=arrays.raw_lengths?Array.from(arrays.raw_lengths.data,Number):Array(state.targets.length).fill(ds.N);state.durationsMs=arrays.durations_ms?Array.from(arrays.durations_ms.data,Number):Array(state.targets.length).fill(0);refreshLabels();lockUi(true);refreshDataset();$('recordProgress').textContent=`Loaded ${state.targets.length} samples from ${file.name}.`;log(`Loaded ${file.name}: ${state.targets.length} samples; raw gestures ${state.rawSamples.length===state.targets.length?'available':'not available'}.`);}catch(err){alert(err.message);log(`Dataset load ERROR: ${err.message}`);}finally{e.target.value='';}});

async function trainModel(){
  try{
    if(!state.setupLocked||!state.targets.length)throw new Error('Create or load a dataset first.');
    const hidden=parseHidden(),epochs=Number($('epochs').value),rep=selectedRep();if(!Number.isInteger(epochs)||epochs<10||epochs>5000)throw new Error('Epochs must be 10..5000.');
    const ds=datasetObject();const K=state.labels.length;const counts=Array(K).fill(0);state.targets.forEach(y=>counts[y]++);if(Math.min(...counts)<2)throw new Error('Each class needs at least two samples for a stratified train/validation split.');
    $('trainBtn').disabled=true;$('trainResult').textContent='Preparing representation…';
    const rows=NAI.buildRepresentationDataset(ds,rep);const D=rows[0].length;const split=NAI.sklearnStratifiedSplit(ds.y,K,42);const scaler=NAI.fitScaler(rows,split.train);const Xtr=NAI.standardizeRows(rows,split.train,scaler),Xva=NAI.standardizeRows(rows,split.test,scaler);const ytr=Int32Array.from(split.train.map(i=>ds.y[i])),yva=Int32Array.from(split.test.map(i=>ds.y[i]));
    const model=NAI.makeModel(D,hidden,K,split.train.length);const tx=tf.tensor2d(NAI.flattenRows(Xtr),[Xtr.length,D],'float32'),vx=tf.tensor2d(NAI.flattenRows(Xva),[Xva.length,D],'float32');let ty,vy;if(K===2){ty=tf.tensor2d(Float32Array.from(ytr),[ytr.length,1]);vy=tf.tensor2d(Float32Array.from(yva),[yva.length,1]);}else{const ity=tf.tensor1d(ytr,'int32'),ivy=tf.tensor1d(yva,'int32');ty=tf.oneHot(ity,K);vy=tf.oneHot(ivy,K);ity.dispose();ivy.dispose();}
    const hist={epoch:[],loss:[],valLoss:[],acc:[],valAcc:[]};$('trainResult').textContent=`Training ${D} → ${hidden.join(' → ')} → ${K}…`;switchTab('curves');
    await model.fit(tx,ty,{epochs,batchSize:Math.min(200,split.train.length),shuffle:true,validationData:[vx,vy],verbose:0,callbacks:{onEpochEnd:async(epoch,l)=>{const acc=l.acc??l.accuracy??0,va=l.val_acc??l.val_accuracy??0;hist.epoch.push(epoch+1);hist.loss.push(l.loss);hist.valLoss.push(l.val_loss);hist.acc.push(acc);hist.valAcc.push(va);if(epoch===0||(epoch+1)%5===0||epoch+1===epochs){$('curveSummary').textContent=`Epoch ${epoch+1}/${epochs} · loss ${l.loss.toFixed(4)} · validation accuracy ${pct(va)}`;drawTrainingCurves(hist);await tf.nextFrame();}}}});
    tx.dispose();vx.dispose();ty.dispose();vy.dispose();
    const tr=await NAI.predictTf(model,Xtr,K),va=await NAI.predictTf(model,Xva,K);const trainAcc=NAI.accuracy(tr.pred,Array.from(ytr)),valAcc=NAI.accuracy(va.pred,Array.from(yva));const pkg=await NAI.exportNai4(model,scaler,state.labels,state.N,rep);
    if(state.model){try{state.model.dispose();}catch(_){}}state.model=model;state.scaler=scaler;state.pkg=pkg;state.history=hist;state.trainedRep=rep;
    $('trainResult').textContent=`Train ${pct(trainAcc)} · validation ${pct(valAcc)} · NAI4 ${(pkg.total/1024).toFixed(1)} KiB`;$('curveSummary').textContent=`Finished ${epochs} epochs · train ${pct(trainAcc)} · validation ${pct(valAcc)} · ${REP_LABEL[rep]}`;$('saveModelBtn').disabled=false;$('deployBtn').disabled=!window.noodleBLE.connected;drawTrainingCurves(hist);log(`Training complete: ${REP_LABEL[rep]}, topology ${pkg.dims.join('→')}, train=${pct(trainAcc)}, validation=${pct(valAcc)}, NAI4=${(pkg.total/1024).toFixed(1)} KiB.`);switchTab('dataset');
  }catch(e){alert(e.message);log(`Training ERROR: ${e.message}`);}finally{$('trainBtn').disabled=!(state.setupLocked&&state.targets.length);}
}
$('trainBtn').addEventListener('click',trainModel);

$('saveModelBtn').addEventListener('click',()=>{if(!state.pkg)return;downloadBlob(state.pkg.blob,`noodleai_${state.trainedRep||'model'}.nai`);});
$('deployBtn').addEventListener('click',async()=>{if(!state.pkg)return;try{$('deployBtn').disabled=true;$('trainingModeBtn').disabled=true;$('inferenceModeBtn').disabled=true;const chunk=Number($('chunkSize').value);await window.noodleBLE.deployPackage(state.pkg.files,{chunkSize:chunk,onProgress:p=>{const prog=$('deployProgress');prog.max=Math.max(1,p.total);prog.value=p.sent;const percent=p.total?Math.round(100*p.sent/p.total):0;const msg={begin:'Starting transactional deployment…','file-begin':`Preparing ${p.file}…`,sending:`${p.file}: ${percent}% total`,commit:'Files verified; validating Noodle model…',done:'MODEL_OK — model activated and ready.',error:`Deployment failed: ${p.error||'unknown error'}`}[p.stage]||p.stage;$('deployText').textContent=msg;}});log('Deployment complete: MODEL_OK.');}catch(e){alert(e.message);log(`Deployment ERROR: ${e.message}`);}finally{$('deployBtn').disabled=!(window.noodleBLE.connected&&state.pkg);$('trainingModeBtn').disabled=!window.noodleBLE.connected;$('inferenceModeBtn').disabled=!window.noodleBLE.connected;}});
$('trainingModeBtn').addEventListener('click',async()=>{try{await window.noodleBLE.setTraining();}catch(e){alert(e.message);}});$('inferenceModeBtn').addEventListener('click',async()=>{try{await window.noodleBLE.setInference();}catch(e){alert(e.message);}});

$('connectBtn').addEventListener('click',async()=>{try{if(window.noodleBLE.connected)await window.noodleBLE.disconnect();else await window.noodleBLE.connect();}catch(e){alert(e.message);log(`BLE ERROR: ${e.message}`);}});
window.noodleBLE.addEventListener('connected',e=>{$('connectBtn').textContent='Disconnect';$('bleBadge').textContent='Connected';$('bleBadge').classList.remove('badge-muted');$('deviceStatus').textContent=`Connected: ${e.detail.name}`;$('supportNote').textContent='Raw six-axis stream active.';$('trainingModeBtn').disabled=false;$('inferenceModeBtn').disabled=false;$('armRecordBtn').disabled=!state.setupLocked;$('deployBtn').disabled=!state.pkg;setBootStatus('BOOT ready · press to capture');log(`BLE connected to ${e.detail.name}.`);});
window.noodleBLE.addEventListener('disconnected',()=>{$('connectBtn').textContent='Connect';$('bleBadge').textContent='Disconnected';$('bleBadge').classList.add('badge-muted');$('deviceStatus').textContent='Disconnected';$('supportNote').textContent=window.NoodleAIBLE.supportMessage();$('trainingModeBtn').disabled=true;$('inferenceModeBtn').disabled=true;$('armRecordBtn').disabled=true;$('deployBtn').disabled=true;setBootStatus('Ready when connected');log('BLE disconnected.');});
window.noodleBLE.addEventListener('warning',e=>log(`BLE warning: ${e.detail.text}`));window.noodleBLE.addEventListener('deploy-log',e=>log(e.detail.text));

window.noodleBLE.addEventListener('imu',e=>{const s=e.detail.sample;$('accelStatus').textContent=`ax ${s.ax.toFixed(3)} g   ay ${s.ay.toFixed(3)} g   az ${s.az.toFixed(3)} g`;$('gyroStatus').textContent=`gx ${s.gx.toFixed(1)} °/s   gy ${s.gy.toFixed(1)} °/s   gz ${s.gz.toFixed(1)} °/s`;pushLive(s);if(state.recording){state.recording.push([s.ax,s.ay,s.az,s.gx,s.gy,s.gz]);$('recordProgress').textContent=`Recording: ${state.recording.length} raw samples…`;finishGestureIfReady();}});

window.noodleBLE.addEventListener('status',e=>{const text=e.detail.text;if(e.detail.notify)log(`Device: ${text}`);if(text==='MODE:T'){state.deviceMode='T';$('modeStatus').textContent='Current mode: TRAINING';$('deviceStatus').textContent='Training mode';setBootStatus('BOOT ready · training');}else if(text==='MODE:I'){state.deviceMode='I';$('modeStatus').textContent='Current mode: INFERENCE';$('deviceStatus').textContent='Inference mode';setBootStatus('BOOT ready · inference');}else if(text==='GESTURE:START'){setBootStatus('BOOT held · capturing',true);if(state.deviceMode==='T')beginGesture();else{$('predictionMeta').textContent='Recording gesture…';$('deviceStatus').textContent='Inference: recording gesture…';}}else if(text.startsWith('GESTURE:END:')){setBootStatus('BOOT released · gesture closed');const p=text.split(':');const count=Number(p[2]||0),durationMs=Number(p[3]||0);if(state.deviceMode==='T'&&state.recording){state.pendingGestureEnd={count,durationMs};finishGestureIfReady();}else{$('predictionMeta').textContent=`raw=${count} samples · duration=${(durationMs/1000).toFixed(2)} s`;$('deviceStatus').textContent='Inference: classifying…';}}else if(text.startsWith('GESTURE:SHORT')){setBootStatus('Gesture too short · try again');state.recording=null;state.pendingGestureEnd=null;state.pendingRaw=null;$('recordProgress').textContent='Gesture too short. Hold BOOT a little longer and try again.';$('predictionMeta').textContent='Gesture too short — try again';$('saveSampleBtn').disabled=true;$('discardSampleBtn').disabled=true;}else if(text==='MODEL_OK'){switchTab('deploy');$('deployText').textContent='FFat model verified, activated, and ready.';}else if(text.startsWith('P:')){const p=text.split(':');if(p.length>=3){const idx=Number(p[1]),conf=Number(p[2]);const label=state.labels[idx]??String(idx);$('predictionLabel').textContent=label;$('predictionConfidence').textContent=`Confidence ${pct(conf)}`;$('deviceStatus').textContent=`Inference: ${label} (${pct(conf)})`;setBootStatus('BOOT ready · next gesture');}}});

function pushLive(s){const L=250;state.live.t.push(s.t_ms/1000);const av=[s.ax,s.ay,s.az],gv=[s.gx,s.gy,s.gz];for(let c=0;c<3;c++){state.live.accel[c].push(av[c]);state.live.gyro[c].push(gv[c]);}if(state.live.t.length>L){state.live.t.shift();for(const a of state.live.accel)a.shift();for(const a of state.live.gyro)a.shift();}drawLineChart($('accelCanvas'),state.live.accel,['ax','ay','az']);drawLineChart($('gyroCanvas'),state.live.gyro,['gx','gy','gz']);}
$('clearPlotBtn').addEventListener('click',()=>{state.live={t:[],accel:[[],[],[]],gyro:[[],[],[]]};drawLiveEmpty();});

function drawLineChart(canvas,series,labels,{fixedY=null}={}){const ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height,pad={l:42,r:14,t:18,b:28};ctx.clearRect(0,0,W,H);ctx.fillStyle='#fbfcfe';ctx.fillRect(0,0,W,H);const all=series.flat().filter(Number.isFinite);let lo=fixedY?fixedY[0]:(all.length?Math.min(...all):-1),hi=fixedY?fixedY[1]:(all.length?Math.max(...all):1);if(Math.abs(hi-lo)<1e-9){lo-=1;hi+=1;}if(!fixedY){const p=.12*(hi-lo);lo-=p;hi+=p;}ctx.strokeStyle='#e3e8ef';ctx.lineWidth=1;for(let k=0;k<=4;k++){const y=pad.t+k*(H-pad.t-pad.b)/4;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(W-pad.r,y);ctx.stroke();}ctx.fillStyle='#758092';ctx.font='12px system-ui';ctx.textAlign='right';ctx.fillText(hi.toFixed(2),pad.l-6,pad.t+4);ctx.fillText(lo.toFixed(2),pad.l-6,H-pad.b);const colors=['#2869df','#00a37a','#d88a14','#8f5bd6'];series.forEach((a,c)=>{if(a.length<2)return;ctx.strokeStyle=colors[c%colors.length];ctx.lineWidth=1.8;ctx.beginPath();for(let i=0;i<a.length;i++){const x=pad.l+i*(W-pad.l-pad.r)/Math.max(1,a.length-1),y=pad.t+(hi-a[i])*(H-pad.t-pad.b)/(hi-lo);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();});ctx.textAlign='left';labels.forEach((l,i)=>{ctx.fillStyle=colors[i%colors.length];ctx.fillRect(pad.l+i*82,H-15,12,3);ctx.fillStyle='#596476';ctx.fillText(l,pad.l+17+i*82,H-10);});}
function drawLiveEmpty(){drawLineChart($('accelCanvas'),[[],[],[]],['ax','ay','az']);drawLineChart($('gyroCanvas'),[[],[],[]],['gx','gy','gz']);}

function drawTrainingCurves(h=state.history){if(!h||!h.epoch?.length){drawLineChart($('lossCanvas'),[[],[]],['train','validation']);drawLineChart($('accuracyCanvas'),[[],[]],['train','validation'],{fixedY:[0,1]});return;}drawLineChart($('lossCanvas'),[h.loss,h.valLoss],['train loss','validation loss']);drawLineChart($('accuracyCanvas'),[h.acc,h.valAcc],['train accuracy','validation accuracy'],{fixedY:[0,1]});}

$('clearLogBtn').addEventListener('click',()=>$('log').textContent='');
$('supportNote').textContent=window.NoodleAIBLE.supportMessage();
refreshLabels();refreshDataset();lockUi(false);updateInputAndTopology();drawLiveEmpty();drawTrainingCurves();initTf();


// ========================================================
// CLINICAL REHABILITATION ENGINE (STANDAR FISIOTERAPI)
// ========================================================
let activeGame = 'peg';
let currentLevel = 1;
let gameRunning = false;
let gameStartTime = 0;
let levelStartTime = 0;
let gameTimerInterval = null;
let gameScore = 0;
let gameDataset = [];

let cursor = { x: 440, y: 260, radius: 22 };
let targetCursor = { x: 440, y: 260 };
const SMOOTH_FACTOR = 0.14;

// Total akumulasi jarak aktual kursor
let totalPathLength = 0;
let lastCursorPos = { x: 440, y: 260 };

// --- Variabel Spesifik Modul Game ---
// 1. Peg
const PEG_WIDTH = 75, PEG_HEIGHT = 105;
let pegs = [], holes = [], heldPeg = null;
// 2. Target
let targetNode = { x: 440, y: 260, r: 45 };
// 3. Pong
let pong = { x: 440, y: 50, dx: 5, dy: 5, r: 15, paddleW: 150 };
// 4. Trace
let traceNodes = [], activeTrace = 0;
// 5. Balance
let balanceZone = { x: 440, w: 200, holdFrames: 0 };

function setupGamePositions(level) {
  heldPeg = null;
  gameScore = 0;
  
  if (activeGame === 'peg') {
    if (level === 1) { // Dekat
      holes = [{ id: 0, x: 280, y: 130, w: PEG_WIDTH, h: PEG_HEIGHT, occupied: false }, { id: 1, x: 280, y: 260, w: PEG_WIDTH, h: PEG_HEIGHT, occupied: false }, { id: 2, x: 280, y: 390, w: PEG_WIDTH, h: PEG_HEIGHT, occupied: false }];
      pegs = [{ id: 0, x: 600, y: 130, w: PEG_WIDTH, h: PEG_HEIGHT, placed: false }, { id: 1, x: 600, y: 260, w: PEG_WIDTH, h: PEG_HEIGHT, placed: false }, { id: 2, x: 600, y: 390, w: PEG_WIDTH, h: PEG_HEIGHT, placed: false }];
    } else if (level === 2) { // Jauh
      holes = [{ id: 0, x: 160, y: 130, w: PEG_WIDTH, h: PEG_HEIGHT, occupied: false }, { id: 1, x: 160, y: 260, w: PEG_WIDTH, h: PEG_HEIGHT, occupied: false }, { id: 2, x: 160, y: 390, w: PEG_WIDTH, h: PEG_HEIGHT, occupied: false }];
      pegs = [{ id: 0, x: 720, y: 130, w: PEG_WIDTH, h: PEG_HEIGHT, placed: false }, { id: 1, x: 720, y: 260, w: PEG_WIDTH, h: PEG_HEIGHT, placed: false }, { id: 2, x: 720, y: 390, w: PEG_WIDTH, h: PEG_HEIGHT, placed: false }];
    } else { // Silang
      holes = [{ id: 0, x: 160, y: 120, w: PEG_WIDTH, h: PEG_HEIGHT, occupied: false }, { id: 1, x: 280, y: 260, w: PEG_WIDTH, h: PEG_HEIGHT, occupied: false }, { id: 2, x: 160, y: 400, w: PEG_WIDTH, h: PEG_HEIGHT, occupied: false }];
      pegs = [{ id: 0, x: 720, y: 400, w: PEG_WIDTH, h: PEG_HEIGHT, placed: false }, { id: 1, x: 600, y: 260, w: PEG_WIDTH, h: PEG_HEIGHT, placed: false }, { id: 2, x: 720, y: 120, w: PEG_WIDTH, h: PEG_HEIGHT, placed: false }];
    }
  } 
  else if (activeGame === 'target') {
    let spread = level === 1 ? 150 : (level === 2 ? 300 : 400);
    targetNode = { x: 440 + (Math.random() * spread - spread/2), y: 260 + (Math.random() * spread/2 - spread/4), r: level === 1 ? 55 : (level === 2 ? 40 : 25) };
  }
  else if (activeGame === 'pong') {
    // PERBAIKAN: 3 Tingkat kecepatan dan lebar pemukul (paddle)
    let speed = level === 1 ? 4 : (level === 2 ? 7 : 11);
    let pWidth = level === 1 ? 180 : (level === 2 ? 110 : 60);
    pong = { x: 440, y: 50, dx: speed, dy: speed, r: 15, paddleW: pWidth };
  }
  else if (activeGame === 'trace') {
    activeTrace = 0;
    if (level === 1) traceNodes = [{x: 200, y: 260}, {x: 440, y: 260}, {x: 680, y: 260}];
    else if (level === 2) traceNodes = [{x: 200, y: 400}, {x: 440, y: 120}, {x: 680, y: 400}];
    else traceNodes = [{x: 150, y: 150}, {x: 730, y: 150}, {x: 150, y: 400}, {x: 730, y: 400}];
  }
  else if (activeGame === 'balance') {
    // PERBAIKAN: 3 Tingkat lebar zona keseimbangan
    let bWidth = level === 1 ? 250 : (level === 2 ? 130 : 60);
    balanceZone = { x: 440, w: bWidth, holdFrames: 0 };
  }
}

window.setLevel = function(lvl) {
  currentLevel = lvl;
  document.querySelectorAll('.level-btn').forEach((b, idx) => {
    b.style.background = (idx + 1 === lvl) ? '#2563eb' : '#1e293b';
    b.style.color = (idx + 1 === lvl) ? '#ffffff' : '#94a3b8';
  });
  window.resetGameSession();
};

window.switchGame = function(name) {
  activeGame = name;
  document.querySelectorAll('.game-menu-btn').forEach(b => b.classList.remove('active-game'));
  const btn = document.getElementById(`btn-${name}`);
  if (btn) btn.classList.add('active-game');
  window.resetGameSession();
};

window.resetGameSession = function() {
  totalPathLength = 0;
  cursor = { x: 440, y: 260, radius: 22 };
  targetCursor = { x: 440, y: 260 };
  lastCursorPos = { x: 440, y: 260 };
  setupGamePositions(currentLevel);

  let titles = { peg: 'Virtual Peg Insertion', target: 'Target Reaching', pong: 'Vertical Pong', trace: 'Path Tracing', balance: 'Tilt Balance' };
  const titleEl = document.getElementById('game-display-title');
  if (titleEl) titleEl.innerText = `Modul: ${titles[activeGame].toUpperCase()} (Lvl ${currentLevel})`;

  const scoreEl = document.getElementById('game-score');
  let maxScore = (activeGame === 'trace' && currentLevel === 3) ? 4 : 3;
  if (scoreEl) scoreEl.innerText = `0/${maxScore}`;
  
  window.renderActiveGameCanvas();
};

window.toggleGameSession = function() {
  const btn = document.getElementById('btn-main-action');
  const saveBtn = document.getElementById('btn-save-log');

  if (!gameRunning) {
    gameRunning = true;
    if (btn) { btn.innerText = "⏹ Selesaikan Sesi Terapi"; btn.style.background = "#dc2626"; }
    if (saveBtn) { saveBtn.disabled = true; saveBtn.style.cursor = "not-allowed"; }
    
    window.resetGameSession();
    gameStartTime = Date.now();
    gameDataset = [];
    
    gameTimerInterval = setInterval(() => {
      const timerEl = document.getElementById('game-timer');
      if (timerEl) timerEl.innerText = `${Math.floor((Date.now() - gameStartTime)/1000)}s`;
    }, 1000);
  } else {
    gameRunning = false;
    if (btn) { btn.innerText = "▶ Mulai Sesi Terapi"; btn.style.background = "#2563eb"; }
    clearInterval(gameTimerInterval);

    if (gameDataset.length > 0 && saveBtn) {
      saveBtn.disabled = false;
      saveBtn.style.cursor = "pointer";
      saveBtn.style.background = "#10b981";
      saveBtn.style.color = "#ffffff";
    }
    // Panggil evaluasi klinis saat game dihentikan
    if(window.evaluatePatientPerformance) window.evaluatePatientPerformance();
  }
};

window.updateGameFromIMU = function(ax, ay, az, gx, gy, gz) {
  if (gameRunning) {
    gameDataset.push({
      time: Date.now() - gameStartTime,
      imu: [ax, ay, az, gx, gy, gz],
      cursor: { x: cursor.x, y: cursor.y },
      game: activeGame, level: currentLevel
    });
    totalPathLength += Math.hypot(cursor.x - lastCursorPos.x, cursor.y - lastCursorPos.y);
    lastCursorPos = { x: cursor.x, y: cursor.y };
  }

  // Pergerakan Kursor Dasar (Smoothed)
  const sensitivity = 2.1;
  const deadzone = 0.04;
  targetCursor.x += Math.abs(ay) > deadzone ? -ay * sensitivity : 0;
  targetCursor.y += Math.abs(ax) > deadzone ? ax * sensitivity : 0;
  targetCursor.x = Math.max(30, Math.min(850, targetCursor.x));
  targetCursor.y = Math.max(30, Math.min(490, targetCursor.y));

  cursor.x += (targetCursor.x - cursor.x) * SMOOTH_FACTOR;
  cursor.y += (targetCursor.y - cursor.y) * SMOOTH_FACTOR;

  // Logika Khusus Tiap Modul Game
  let maxScore = (activeGame === 'trace' && currentLevel === 3) ? 4 : 3;

  if (activeGame === 'peg' && heldPeg !== null) {
    pegs[heldPeg].x = cursor.x; pegs[heldPeg].y = cursor.y;
    holes.forEach(hole => {
      if (!hole.occupied && Math.hypot(cursor.x - hole.x, cursor.y - hole.y) < 50) {
        pegs[heldPeg].x = hole.x; pegs[heldPeg].y = hole.y;
        pegs[heldPeg].placed = true; hole.occupied = true;
        heldPeg = null; gameScore++;
      }
    });
  } 
  else if (activeGame === 'target' && gameRunning) {
    if (Math.hypot(cursor.x - targetNode.x, cursor.y - targetNode.y) < targetNode.r + cursor.radius) {
      gameScore++;
      let spread = currentLevel === 1 ? 150 : (currentLevel === 2 ? 300 : 400);
      targetNode = { x: 440 + (Math.random() * spread - spread/2), y: 260 + (Math.random() * spread/2 - spread/4), r: targetNode.r };
    }
  }
  else if (activeGame === 'pong' && gameRunning) {
    pong.x += pong.dx; pong.y += pong.dy;
    if (pong.x < pong.r || pong.x > 880 - pong.r) pong.dx *= -1;
    if (pong.y < pong.r) pong.dy *= -1;
    
    // Paddle Collision (Kursor bertindak sebagai paddle)
    if (pong.y > 480 - pong.r && pong.x > cursor.x - pong.paddleW/2 && pong.x < cursor.x + pong.paddleW/2) {
      pong.dy *= -1; pong.y = 480 - pong.r; gameScore++;
    } else if (pong.y > 520) {
      pong.x = 440; pong.y = 50; pong.dy = Math.abs(pong.dy); // Reset ball if dropped
    }
  }
  else if (activeGame === 'trace' && gameRunning) {
    if (activeTrace < traceNodes.length) {
      let target = traceNodes[activeTrace];
      if (Math.hypot(cursor.x - target.x, cursor.y - target.y) < 40) {
        activeTrace++; gameScore++;
      }
    }
  }
  else if (activeGame === 'balance' && gameRunning) {
    // Kursor harus tetap berada di dalam balanceZone (tengah)
    if (cursor.x > balanceZone.x - balanceZone.w/2 && cursor.x < balanceZone.x + balanceZone.w/2) {
      balanceZone.holdFrames++;
      if (balanceZone.holdFrames > 60) { // Sekitar 1 detik bertahan
        gameScore++; balanceZone.holdFrames = 0;
      }
    } else {
      balanceZone.holdFrames = Math.max(0, balanceZone.holdFrames - 2); // Penalti jika keluar
    }
  }

  // Update UI Skor
  const scoreEl = document.getElementById('game-score');
  if (scoreEl) scoreEl.innerText = `${gameScore}/${maxScore}`;

  // Cek Kemenangan
  if (gameScore >= maxScore && gameRunning) {
    window.toggleGameSession();
  }

  window.renderActiveGameCanvas();
};

window.triggerHardwareClick = function() {
  if (activeGame === 'peg') {
    if (heldPeg === null) {
      pegs.forEach((peg, idx) => {
        if (!peg.placed && Math.hypot(cursor.x - peg.x, cursor.y - peg.y) < 55) heldPeg = idx;
      });
    } else {
      heldPeg = null;
    }
  }
};

window.renderActiveGameCanvas = function() {
  const canvas = document.getElementById('game-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Render elemen spesifik game
  if (activeGame === 'peg') {
    // FITUR BARU: Garis Bantu Latihan Koordinasi (Hanya muncul di Level 1)
    if (currentLevel === 1) {
      ctx.save();
      ctx.setLineDash([15, 15]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 45; // Jalur tebal sebagai panduan batas area
      ctx.lineCap = 'round';
      ctx.beginPath();
      // Menggambar jalur dari posisi Peg ke Hole untuk level 1
      ctx.moveTo(600, 130); ctx.lineTo(280, 130);
      ctx.moveTo(600, 260); ctx.lineTo(280, 260);
      ctx.moveTo(600, 390); ctx.lineTo(280, 390);
      ctx.stroke();
      ctx.restore();
    }

    holes.forEach(h => {
      ctx.fillStyle = h.occupied ? '#1e293b' : '#334155';
      ctx.beginPath(); ctx.roundRect(h.x - h.w/2, h.y - h.h/2, h.w, h.h, 12); ctx.fill();
      ctx.strokeStyle = h.occupied ? '#22c55e' : '#64748b'; ctx.lineWidth = 3; ctx.stroke();
    });
    pegs.forEach(p => {
      ctx.fillStyle = p.placed ? '#10b981' : '#2563eb';
      ctx.beginPath(); ctx.roundRect(p.x - p.w/2, p.y - p.h/2, p.w, p.h, 12); ctx.fill();
      ctx.strokeStyle = p.placed ? '#34d399' : '#60a5fa'; ctx.lineWidth = 3; ctx.stroke();
    });
  } 
  else if (activeGame === 'target') {
    // FITUR BARU: Garis bantu dari tengah layar ke target (Hanya Level 1)
    if (currentLevel === 1) {
      ctx.save();
      ctx.setLineDash([10, 10]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 30;
      ctx.beginPath();
      ctx.moveTo(440, 260); // Titik start ideal dari tengah
      ctx.lineTo(targetNode.x, targetNode.y);
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(targetNode.x, targetNode.y, targetNode.r, 0, Math.PI*2);
    ctx.fill(); ctx.stroke();
  }
  else if (activeGame === 'pong') {
    ctx.fillStyle = '#facc15';
    ctx.beginPath(); ctx.arc(pong.x, pong.y, pong.r, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#38bdf8'; // Paddle
    ctx.roundRect(cursor.x - pong.paddleW/2, 480, pong.paddleW, 16, 8); ctx.fill();
  }
  else if (activeGame === 'trace') {
    // Garis lintasan untuk Tracing sudah ada by default
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 15; ctx.lineCap = 'round';
    ctx.beginPath();
    traceNodes.forEach((n, i) => i===0 ? ctx.moveTo(n.x, n.y) : ctx.lineTo(n.x, n.y));
    ctx.stroke();
    traceNodes.forEach((n, i) => {
      ctx.fillStyle = i < activeTrace ? '#10b981' : (i === activeTrace ? '#fbbf24' : '#1e293b');
      ctx.beginPath(); ctx.arc(n.x, n.y, 25, 0, Math.PI*2); ctx.fill();
    });
  }
  else if (activeGame === 'balance') {
    ctx.fillStyle = 'rgba(56, 189, 248, 0.1)';
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(balanceZone.x - balanceZone.w/2, 100, balanceZone.w, 320, 16);
    ctx.fill(); ctx.stroke();
    // Progress bar keseimbangan
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(balanceZone.x - balanceZone.w/2, 430, (balanceZone.holdFrames/60) * balanceZone.w, 10);
  }

  // Render Kursor Merah (Player)
  ctx.save();
  ctx.shadowColor = 'rgba(239, 68, 68, 0.7)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(cursor.x, cursor.y, cursor.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

// ========================================================
// EVALUASI KUANTITATIF FISIOTERAPI (SKALA 1 - 5 & METRIK)
// ========================================================
window.evaluatePatientPerformance = function() {
  const durationSec = Math.floor((Date.now() - gameStartTime) / 1000);
  const totalSamples = gameDataset.length;

  let jerkinessTotal = 0;
  let tremorSpikeCount = 0;
  let firstHalfJerk = 0;
  let secondHalfJerk = 0;
  const midPoint = Math.floor(totalSamples / 2);

  // Analisis Sinyal Percepatan IMU
  for (let i = 1; i < totalSamples; i++) {
    const prev = gameDataset[i - 1].imu;
    const curr = gameDataset[i].imu;

    // Menghitung turunan percepatan (Jerk) pada akselerometer
    const dAx = Math.abs(curr[0] - prev[0]);
    const dAy = Math.abs(curr[1] - prev[1]);
    const sampleJerk = dAx + dAy;
    jerkinessTotal += sampleJerk;

    // Deteksi hentakan getaran bolak-balik (Tremor patologis: > 0.45 g)
    if (sampleJerk > 0.45) {
      tremorSpikeCount++;
    }

    if (i < midPoint) {
      firstHalfJerk += sampleJerk;
    } else {
      secondHalfJerk += sampleJerk;
    }
  }

  // 1. Kelancaran Gerak (Smoothness)
  const avgJerk = totalSamples > 0 ? (jerkinessTotal / totalSamples) : 0;
  const smoothness = Math.max(10, Math.min(100, Math.round(100 - (avgJerk * 30))));

  // 2. Status Tremor (Konsisten secara mutlak dengan Smoothness)
  // Tremor HANYA terdeteksi jika kelancaran rendah (< 75%) atau lonjakan hentakan sangat sering
  const isTremorActive = (smoothness < 75 || (tremorSpikeCount > 15 && smoothness < 85));

  // 3. Efisiensi Lintasan / Trajectory Efficiency (%)
  const idealDist = 1100;
  const pathEfficiency = Math.max(10, Math.min(100, Math.round((idealDist / Math.max(idealDist, totalPathLength)) * 100)));

  // 4. Analisis Ketahanan (Endurance / Fatigue Ratio)
  let enduranceStatus = "Stabil";
  const fatigueRatio = firstHalfJerk > 0 ? (secondHalfJerk / firstHalfJerk) : 1.0;
  if (fatigueRatio > 1.35 && totalSamples > 40) {
    enduranceStatus = "Fatigue (Kelelahan)";
  }

  // 5. Penilaian Skala Fungsional Klinis 1 - 5 (Berdasarkan Waktu TJP & Koordinasi)
  let clinicalScore = 1;
  let categoryName = "";
  let evaluationDetail = "";

  if (gameScore === 3) {
    if (durationSec <= 12 && pathEfficiency >= 75 && !isTremorActive) {
      clinicalScore = 5;
      categoryName = "Sangat Mandiri / Baik";
      evaluationDetail = `Target tuntas dengan kecepatan optimal (${durationSec}s) dan lintasan stabil (${pathEfficiency}%). Tidak ditemukan tremor maupun tanda kelelahan dini.`;
    } else if (durationSec <= 20 && !isTremorActive) {
      clinicalScore = 4;
      categoryName = "Fungsional Ringan";
      evaluationDetail = `Target selesai mendekati batas waktu (${durationSec}s) dengan kendali motorik stabil dan deviasi lintasan ringan yang terkompensasi baik.`;
    } else if (durationSec <= 35) {
      clinicalScore = 3;
      categoryName = "Komparasi Sedang";
      evaluationDetail = `Target selesai dalam durasi adaptif (${durationSec}s). Ditemukan lintasan meliuk (${pathEfficiency}%) atau fluktuasi tremor ringan saat presisi penempatan.`;
    } else if (durationSec <= 60) {
      clinicalScore = 2;
      categoryName = "Kompensatorik Lambat";
      evaluationDetail = `Penyelesaian memerlukan waktu tambahan (${durationSec}s) dengan jalur gerak tidak teratur. Dianjurkan latihan repetitif terarah pada jarak lebih dekat.`;
    } else {
      clinicalScore = 1;
      categoryName = "Hambatan Fungsional";
      evaluationDetail = `Waktu eksekusi melampaui batas batas aman klinis (> 60s). Ditemukan perlambatan motorik dominan dan penurunan ketahanan fisik.`;
    }
  } else {
    clinicalScore = durationSec > 60 ? 1 : 2;
    categoryName = clinicalScore === 1 ? "Hambatan Fungsional" : "Kompensatorik Lambat";
    evaluationDetail = `Subjek menyelesaikan ${gameScore}/3 target. Mengalami hambatan koordinasi sebelum seluruh target berhasil ditempatkan.`;
  }

  // Pembaruan Elemen Tampilan UI
  document.getElementById('rep-target').innerText = `${gameScore}/3 (${durationSec}s)`;
  document.getElementById('rep-rom').innerText = `${pathEfficiency}%`;
  document.getElementById('rep-smoothness').innerText = `${smoothness}% (Tremor: ${isTremorActive ? 'Terdeteksi' : 'Normal'})`;

  const endurEl = document.getElementById('rep-endurance');
  endurEl.innerText = enduranceStatus;
  endurEl.style.color = enduranceStatus === "Stabil" ? "#4ade80" : "#f87171";

  const diagEl = document.getElementById('rep-diagnosis');
  diagEl.innerHTML = `
    <div style="font-size: 14px; font-weight: bold; color: #38bdf8; margin-bottom: 6px;">
      Skor Fungsional Klinis: Nilai ${clinicalScore} / 5 (${categoryName})
    </div>
    <div style="font-size: 12px; line-height: 1.5; color: #cbd5e1;">
      <strong>Evaluasi:</strong> ${evaluationDetail}
    </div>
  `;

  const modal = document.getElementById('rehab-summary-modal');
  if (modal) modal.style.display = 'flex';
};

window.closeRehabModal = function() {
  const modal = document.getElementById('rehab-summary-modal');
  if (modal) modal.style.display = 'none';
};

window.exportGameDataset = function() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(gameDataset));
  const a = document.createElement('a');
  a.href = dataStr;
  a.download = `clinical_eval_lvl${currentLevel}_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
};