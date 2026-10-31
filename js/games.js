'use strict';
/* NoodleAI Games — event-based games driven by MLP gesture classification.
   Event source: device status "P:<classIndex>:<confidence>" (inference mode) or keyboard test mode.
   Locked until a model has been trained (state.pkg). Uses state.labels as the gesture vocabulary. */
(function(){
const W=640,H=360,$=id=>document.getElementById(id),L=()=>state.labels||[],R=n=>Math.floor(Math.random()*n);
const ready=()=>!!(state&&state.pkg);
const T=(c,s,x,y,sz=20,col='#e5e7eb',al='center')=>{c.font=`700 ${sz}px system-ui,sans-serif`;c.fillStyle=col;c.textAlign=al;c.fillText(s,x,y);};
const bar=(c,x,y,w,h,f,col)=>{c.fillStyle='#1f2937';c.fillRect(x,y,w,h);c.fillStyle=col;c.fillRect(x,y,w*Math.max(0,Math.min(1,f)),h);};
const WORDS=['ABA','ADA','AKU','API','BAU','BUKU','BATU','IBU','IKAN','ITU','KAKI','KALI','KAMU','KUDA','LAMA','MATA','ULAT','ULAR','TIKUS','RUMAH','BAKSO','SATU','DUA','TIGA','EMPAT'];

/* ---------- Game 1 & 2: air-writing (digits / letters) ---------- */
function typer(math,M){
  const g={over:false,sc:0,n:0,t:20,typed:'',ans:'',q:'',msg:'',sy:null,has:null};
  const next=()=>{
    const has=g.has;let k=0;
    if(math){
      do{const a=1+R(9),b=1+R(9),o=R(3);let v,s;
        if(o===0){v=a+b;s=`${a} + ${b}`}else if(o===1){v=Math.abs(a-b);s=`${Math.max(a,b)} − ${Math.min(a,b)}`}else{v=a*b;s=`${a} × ${b}`}
        g.ans=String(v);g.q=s+' = ?';k++;
      }while(![...g.ans].every(d=>has.has(d))&&k<300);
      if(![...g.ans].every(d=>has.has(d))){const a=[...has];g.ans=a[R(a.length)];g.q=`Tulis angka ${g.ans}`;}
    }else{
      const ok=WORDS.filter(w=>[...w].every(c=>has.has(c)));
      if(ok.length){g.ans=ok[R(ok.length)];g.q=`Eja kata: ${g.ans}`;}
      else{const a=[...has];g.ans=Array.from({length:3},()=>a[R(a.length)]).join('');g.q=`Tulis huruf: ${g.ans}`;}
    }
    g.typed='';g.t=20;
  };
  const judge=()=>{
    if(g.typed===g.ans){g.sc+=10+Math.ceil(g.t);g.msg='✔ Benar!';}else g.msg=`✘ Jawaban: ${g.ans}`;
    g.n++;if(g.n>=8){g.over=true;return;}next();
  };
  g.init=()=>{
    g.sy=new Map();
    L().forEach((s,i)=>{const u=String(s).trim().toUpperCase();if(math?/^\d$/.test(u):/^[A-Z]$/.test(u))g.sy.set(i,u);});
    g.has=new Set(g.sy.values());
    if(g.sy.size<2)return math?'Butuh minimal 2 kelas berlabel angka tunggal (0–9), mis. “3”, “7”.':'Butuh minimal 2 kelas berlabel satu huruf, mis. “A”, “B”.';
    next();
  };
  g.update=dt=>{if(g.over)return;g.t-=dt;if(g.t<=0){g.msg='⏱ Waktu habis';g.typed='';judge();}};
  g.gesture=i=>{if(g.over)return;const ch=g.sy.get(i);if(!ch){g.msg='Gerakan itu bukan simbol game ini';return;}g.typed+=ch;if(g.typed.length>=g.ans.length)judge();};
  g.draw=c=>{
    T(c,`Soal ${Math.min(g.n+1,8)}/8`,W/2,60,16,'#94a3b8');
    T(c,g.q,W/2,140,44,'#fde68a');
    T(c,g.typed.padEnd(g.ans.length,'_').split('').join(' '),W/2,220,56,'#86efac');
    bar(c,120,250,400,10,g.t/20,'#38bdf8');
    T(c,g.msg,W/2,300,20,'#e5e7eb');
    T(c,'Simbol: '+[...g.has].sort().join(' '),W/2,340,14,'#94a3b8');
  };
  return g;
}

/* ---------- Game 3: Tinju ---------- */
function box(){
  const g={over:false,sc:0,me:100,foe:100,p:0,t:3,w:3,cb:0,msg:'Bersiap!'};
  const nx=()=>{g.p=R(L().length);g.t=g.w;};
  const chk=()=>{if(g.me<=0||g.foe<=0){g.over=true;g.win=g.foe<=0;g.msg=g.foe<=0?'K.O.! Kamu menang 🥊':'Kamu K.O.';}};
  g.init=()=>{if(L().length<2)return'Butuh minimal 2 kelas gerakan.';nx();};
  g.update=dt=>{if(g.over)return;g.t-=dt;if(g.t<=0){g.me-=12;g.cb=0;g.msg='Telat! Kamu kena pukul';chk();if(!g.over)nx();}};
  g.gesture=i=>{
    if(g.over)return;
    if(i===g.p){g.foe-=10+Math.min(g.cb,5)*2;g.sc+=10+g.cb*2;g.cb++;g.w=Math.max(1.3,g.w-.08);g.msg=`Kena! Combo x${g.cb}`;}
    else{g.me-=10;g.cb=0;g.msg=`Salah! (${L()[i]})`;}
    chk();if(!g.over)nx();
  };
  g.draw=c=>{
    T(c,'KAMU',90,60,16,'#94a3b8');bar(c,20,70,260,16,g.me/100,'#4ade80');
    T(c,'LAWAN',W-90,60,16,'#94a3b8');bar(c,W-280,70,260,16,g.foe/100,'#f87171');
    T(c,'Lakukan gerakan:',W/2,150,18,'#94a3b8');
    T(c,String(L()[g.p]||'').toUpperCase(),W/2,215,64,'#fde68a');
    bar(c,120,240,400,12,g.t/g.w,'#fb923c');
    T(c,g.msg,W/2,295,20);T(c,`Combo x${g.cb}`,W/2,330,16,'#94a3b8');
  };
  return g;
}

/* ---------- Game 4: Flappy Bird (gesture = flap) ---------- */
function flappy(M){
  const g={over:false,sc:0,y:H/2,vy:0,p:[],tm:0,go:false};
  g.init=()=>{if(M.flap==null)return'Pilih kelas untuk gerakan flap.';};
  g.update=dt=>{
    if(!g.go||g.over)return;
    g.vy+=520*dt;g.y+=g.vy*dt;g.tm-=dt;
    if(g.tm<=0){g.tm=2.3;g.p.push({x:W+20,g:60+R(100)});}
    g.p.forEach(q=>q.x-=90*dt);g.p=g.p.filter(q=>q.x>-60);
    g.p.forEach(q=>{
      if(!q.s&&q.x+40<98){q.s=1;g.sc++;}
      if(122>q.x&&98<q.x+40&&(g.y-12<q.g||g.y+12>q.g+140))g.over=true;
    });
    if(g.y>H-12||g.y<12)g.over=true;
  };
  g.gesture=i=>{if(i!==M.flap||g.over)return;g.go=true;g.vy=-240;};
  g.draw=c=>{
    c.fillStyle='#0ea5e9';c.fillRect(0,0,W,H);
    c.fillStyle='#22c55e';g.p.forEach(q=>{c.fillRect(q.x,0,40,q.g);c.fillRect(q.x,q.g+140,40,H);});
    c.fillStyle='#facc15';c.beginPath();c.arc(110,g.y,12,0,7);c.fill();
    T(c,String(g.sc),W/2,70,48,'#fff');
    if(!g.go)T(c,`Lakukan gerakan “${L()[M.flap]}” untuk mulai`,W/2,H-30,18,'#fff');
  };
  return g;
}

/* ---------- Game 5: Ingat Urutan (Simon) ---------- */
function simon(){
  const g={over:false,sc:0,seq:[],ph:'show',st:0,ip:0};
  const add=()=>{g.seq.push(R(L().length));g.ph='show';g.st=-0.8;g.ip=0;};
  g.init=()=>{if(L().length<2)return'Butuh minimal 2 kelas gerakan.';add();};
  g.update=dt=>{if(g.ph==='show'&&!g.over){g.st+=dt;if(g.st>=g.seq.length*.9){g.ph='in';g.ip=0;}}};
  g.gesture=i=>{
    if(g.ph!=='in'||g.over)return;
    if(i===g.seq[g.ip]){g.ip++;if(g.ip===g.seq.length){g.sc++;add();}}else g.over=true;
  };
  g.draw=c=>{
    if(g.ph==='show'){
      const k=Math.floor(g.st/.9);
      T(c,'Perhatikan urutan…',W/2,80,20,'#94a3b8');
      if(k>=0&&k<g.seq.length&&g.st%.9<.7)T(c,String(L()[g.seq[k]]).toUpperCase(),W/2,210,64,'#fde68a');
    }else{
      T(c,`Giliranmu! ${g.ip}/${g.seq.length}`,W/2,80,22,'#86efac');
      g.seq.forEach((_,k)=>{c.fillStyle=k<g.ip?'#86efac':'#334155';c.beginPath();c.arc(W/2-(g.seq.length-1)*14+k*28,210,10,0,7);c.fill();});
    }
    T(c,`Ronde ${g.seq.length}`,W/2,330,16,'#94a3b8');
  };
  return g;
}

/* ---------- Game 6: Ular (Snake, 4 direction gestures) ---------- */
function snake(M){
  const C=20,cw=32,ch=18,g={over:false,sc:0,b:[[10,9],[9,9],[8,9]],d:[1,0],nd:[1,0],f:null,tm:0};
  const fd=()=>{do{g.f=[R(cw),R(ch)];}while(g.b.some(s=>s[0]===g.f[0]&&s[1]===g.f[1]));};
  g.init=()=>{if(new Set([M.up,M.down,M.left,M.right]).size<4)return'Pilih 4 kelas berbeda untuk atas/bawah/kiri/kanan.';fd();};
  g.update=dt=>{
    if(g.over)return;g.tm+=dt;if(g.tm<.3)return;g.tm=0;g.d=g.nd;
    const h=[(g.b[0][0]+g.d[0]+cw)%cw,(g.b[0][1]+g.d[1]+ch)%ch];
    if(g.b.some(s=>s[0]===h[0]&&s[1]===h[1])){g.over=true;return;}
    g.b.unshift(h);if(h[0]===g.f[0]&&h[1]===g.f[1]){g.sc++;fd();}else g.b.pop();
  };
  g.gesture=i=>{
    const m={[M.up]:[0,-1],[M.down]:[0,1],[M.left]:[-1,0],[M.right]:[1,0]}[i];
    if(m&&!(m[0]===-g.d[0]&&m[1]===-g.d[1]))g.nd=m;
  };
  g.draw=c=>{
    c.fillStyle='#111827';c.fillRect(0,0,W,H);
    c.fillStyle='#f87171';c.fillRect(g.f[0]*C+2,g.f[1]*C+2,C-4,C-4);
    g.b.forEach((s,k)=>{c.fillStyle=k?'#4ade80':'#bbf7d0';c.fillRect(s[0]*C+1,s[1]*C+1,C-2,C-2);});
  };
  return g;
}

/* ---------- Game 7: Suit (Batu-Gunting-Kertas, first to 3) ---------- */
function suit(M){
  const nm=['Batu','Gunting','Kertas'],em=['✊','✌️','✋'],g={over:false,sc:0,cs:0,cp:-1,msg:'Lakukan gerakan pilihanmu!'};
  g.init=()=>{if(new Set([M.rock,M.sci,M.pap]).size<3)return'Pilih 3 kelas berbeda untuk batu/gunting/kertas.';};
  g.update=()=>{};
  g.gesture=i=>{
    if(g.over)return;const m=[M.rock,M.sci,M.pap].indexOf(i);if(m<0)return;const c=R(3);g.cp=c;
    if(m===c)g.msg=`Seri! Komputer: ${nm[c]}`;
    else if((m+1)%3===c){g.sc++;g.msg=`Menang! Komputer: ${nm[c]}`;}
    else{g.cs++;g.msg=`Kalah! Komputer: ${nm[c]}`;}
    if(g.sc>=3||g.cs>=3){g.over=true;g.win=g.sc>=3;}
  };
  g.draw=c=>{
    T(c,`Kamu ${g.sc}  :  ${g.cs} Komputer`,W/2,80,32,'#fde68a');
    T(c,g.cp>=0?em[g.cp]:'❔',W/2,200,90);
    T(c,g.msg,W/2,270,22);T(c,'Siapa lebih dulu 3 menang',W/2,330,14,'#94a3b8');
  };
  return g;
}

/* ---------- Game 8: Pukul Tikus ---------- */
function mole(){
  const g={over:false,sc:0,lv:3,m:0,mt:2,msg:'',n:0};
  const sp=()=>{g.m=R(g.n);g.mt=Math.max(.9,2-g.sc*.03);};
  const hurt=s=>{g.lv--;g.msg=s;if(g.lv<=0)g.over=true;else sp();};
  g.init=()=>{g.n=Math.min(L().length,6);if(g.n<2)return'Butuh minimal 2 kelas gerakan.';sp();};
  g.update=dt=>{if(g.over)return;g.mt-=dt;if(g.mt<=0)hurt('Tikus kabur!');};
  g.gesture=i=>{if(g.over||i>=g.n)return;if(i===g.m){g.sc++;g.msg='Kena!';sp();}else hurt('Salah lubang!');};
  g.draw=c=>{
    T(c,'♥'.repeat(Math.max(0,g.lv)),W/2,60,28,'#f87171');
    for(let k=0;k<g.n;k++){
      const x=W/2+(k%3-1)*190,y=125+Math.floor(k/3)*115,on=k===g.m;
      c.fillStyle=on?'#854d0e':'#1e293b';c.beginPath();c.ellipse(x,y,60,26,0,0,7);c.fill();
      if(on)T(c,'🐭',x,y+8,48);
      T(c,String(L()[k]),x,y+46,16,on?'#fde68a':'#94a3b8');
    }
    bar(c,120,H-40,400,10,g.mt/Math.max(.9,2-g.sc*.03),'#fb923c');T(c,g.msg,W/2,H-55,18);
  };
  return g;
}

/* ---------- Game 9: Lari Rintangan (lompat / merunduk) ---------- */
function runner(M){
  const g={over:false,sc:0,ob:[],tm:1,act:'',at:0};
  g.init=()=>{if(M.jump===M.duck)return'Pilih 2 kelas berbeda untuk lompat dan merunduk.';};
  g.update=dt=>{
    if(g.over)return;
    g.at-=dt;if(g.at<=0)g.act='';
    g.tm-=dt;if(g.tm<=0){g.ob.push({x:W+20,k:R(2)});g.tm=1.8+Math.random()*.8;}
    const sp=170+g.sc*5;g.ob.forEach(o=>{o.x-=sp*dt;});
    g.ob.forEach(o=>{
      if(o.x<122&&o.x+30>80&&g.act!==(o.k?'duck':'jump'))g.over=true;
      if(!o.s&&o.x+30<80){o.s=1;g.sc++;}
    });
    g.ob=g.ob.filter(o=>o.x>-40);
  };
  g.gesture=i=>{if(g.over)return;if(i===M.jump){g.act='jump';g.at=.9;}else if(i===M.duck){g.act='duck';g.at=.9;}};
  g.draw=c=>{
    c.fillStyle='#334155';c.fillRect(0,260,W,4);
    g.ob.forEach(o=>{c.fillStyle=o.k?'#c084fc':'#f87171';c.fillRect(o.x,o.k?190:220,30,40);});
    const py=g.act==='jump'?170:g.act==='duck'?235:210,ph=g.act==='duck'?25:50;
    c.fillStyle='#facc15';c.fillRect(90,py,30,ph);
    T(c,'Merah = LOMPAT · Ungu (melayang) = MERUNDUK',W/2,310,16,'#94a3b8');
    T(c,`Lompat: ${L()[M.jump]} · Merunduk: ${L()[M.duck]}`,W/2,335,14,'#64748b');
  };
  return g;
}

/* ---------- Game 10: Tembak Meteor ---------- */
function meteor(){
  const g={over:false,sc:0,en:[],tm:0,lv:3,msg:'Lakukan gerakan sesuai tulisan di meteor'};
  g.init=()=>{if(L().length<2)return'Butuh minimal 2 kelas gerakan.';};
  g.update=dt=>{
    if(g.over)return;
    g.tm-=dt;if(g.tm<=0){g.en.push({x:70+R(W-140),y:0,k:R(L().length)});g.tm=Math.max(.9,2.4-g.sc*.04);}
    g.en.forEach(e=>{e.y+=(42+g.sc*1.5)*dt;});
    const hit=g.en.filter(e=>e.y>H-40);
    if(hit.length){g.lv-=hit.length;g.en=g.en.filter(e=>e.y<=H-40);if(g.lv<=0)g.over=true;}
  };
  g.gesture=i=>{
    if(g.over)return;
    const e=g.en.filter(q=>q.k===i).sort((a,b)=>b.y-a.y)[0];
    if(e){g.en.splice(g.en.indexOf(e),1);g.sc++;g.msg='Boom! 💥';}else g.msg=`Tidak ada meteor “${L()[i]}”`;
  };
  g.draw=c=>{
    c.fillStyle='#0b1220';c.fillRect(0,0,W,H);
    g.en.forEach(e=>{c.fillStyle='#78350f';c.beginPath();c.arc(e.x,e.y,28,0,7);c.fill();T(c,String(L()[e.k]),e.x,e.y+5,13,'#fef3c7');});
    c.fillStyle='#38bdf8';c.fillRect(0,H-12,W,12);
    T(c,'♥'.repeat(Math.max(0,g.lv)),W/2,30,22,'#f87171');T(c,g.msg,W/2,H-24,16);
  };
  return g;
}

/* ---------- Game 11: Balap Lajur (geser kiri/kanan) ---------- */
function racer(M){
  const g={over:false,sc:0,ln:1,ob:[],tm:0};
  g.init=()=>{if(M.left===M.right)return'Pilih 2 kelas berbeda untuk kiri dan kanan.';};
  g.update=dt=>{
    if(g.over)return;
    g.tm-=dt;
    if(g.tm<=0){const a=R(3);g.ob.push({l:a,y:-30});if(Math.random()<.4)g.ob.push({l:(a+1+R(2))%3,y:-30});g.tm=Math.max(.8,1.5-g.sc*.02);}
    g.ob.forEach(o=>{o.y+=(130+g.sc*3)*dt;});
    g.ob.forEach(o=>{if(o.l===g.ln&&o.y>H-95&&o.y<H-35)g.over=true;if(!o.s&&o.y>H){o.s=1;g.sc++;}});
    g.ob=g.ob.filter(o=>o.y<H+40);
  };
  g.gesture=i=>{if(g.over)return;if(i===M.left)g.ln=Math.max(0,g.ln-1);else if(i===M.right)g.ln=Math.min(2,g.ln+1);};
  g.draw=c=>{
    c.fillStyle='#1f2937';c.fillRect(W/2-165,0,330,H);
    c.fillStyle='#475569';[W/2-55,W/2+55].forEach(x=>c.fillRect(x-2,0,4,H));
    g.ob.forEach(o=>{c.fillStyle='#f87171';c.fillRect(W/2+(o.l-1)*110-25,o.y,50,50);});
    c.fillStyle='#38bdf8';c.fillRect(W/2+(g.ln-1)*110-22,H-90,44,55);
    T(c,`Kiri: ${L()[M.left]} · Kanan: ${L()[M.right]}`,W/2,H-8,13,'#94a3b8');
  };
  return g;
}

/* ---------- Framework ---------- */
const guessRe=s=>new RegExp(s,'i');
const GAMES=[
  {id:'math',n:'Berhitung Udara',d:'Tulis jawaban soal hitung di udara (air-writing angka). Perlu kelas berlabel angka 0–9.',mk:M=>typer(true,M)},
  {id:'spell',n:'Eja Kata (Huruf)',d:'Eja kata dengan menulis huruf di udara. Perlu kelas berlabel satu huruf (A–Z).',mk:M=>typer(false,M)},
  {id:'box',n:'Tinju',d:'Lawan menyebut gerakan; lakukan gerakan yang sama sebelum waktu habis untuk memukul balik.',mk:box},
  {id:'flap',n:'Flappy Bird',d:'Satu gerakan = satu kepakan. Lewati pipa tanpa menabrak.',roles:[['flap','Kelas gerakan flap','flap|naik|up|atas|lompat|jump']],mk:flappy},
  {id:'simon',n:'Ingat Urutan',d:'Hafalkan urutan gerakan yang ditampilkan lalu ulangi persis. Urutan makin panjang.',mk:simon},
  {id:'snake',n:'Ular',d:'Arahkan ular dengan 4 gerakan arah untuk memakan makanan. Dinding tembus ke sisi seberang.',roles:[['up','Atas','atas|up|naik'],['down','Bawah','bawah|down|turun'],['left','Kiri','kiri|left'],['right','Kanan','kanan|right']],mk:snake},
  {id:'suit',n:'Suit (Batu-Gunting-Kertas)',d:'Lawan komputer, siapa lebih dulu menang 3 kali. Pilih kelas untuk batu, gunting, kertas.',roles:[['rock','Batu','batu|rock|kepal'],['sci','Gunting','gunting|scissor'],['pap','Kertas','kertas|paper|buka']],mk:suit},
  {id:'mole',n:'Pukul Tikus',d:'Tikus muncul di lubang berlabel gerakan. Lakukan gerakan lubang itu sebelum tikus kabur. Nyawa 3.',mk:mole},
  {id:'run',n:'Lari Rintangan',d:'Lompati rintangan merah dan merunduk di bawah rintangan ungu yang melayang.',roles:[['jump','Gerakan lompat','lompat|jump|naik|atas'],['duck','Gerakan merunduk','tunduk|duck|bawah|turun']],mk:runner},
  {id:'meteor',n:'Tembak Meteor',d:'Meteor jatuh bertuliskan nama gerakan. Lakukan gerakan itu untuk menembaknya. Jangan sampai 3 meteor mendarat.',mk:meteor},
  {id:'race',n:'Balap Lajur',d:'Geser mobil ke kiri/kanan di 3 lajur untuk menghindari rintangan.',roles:[['left','Pindah kiri','kiri|left'],['right','Pindah kanan','kanan|right']],mk:racer},
];
/* ---------- Cara bermain (dinamis, mengikuti label & pemetaan kelas) ---------- */
const q=i=>`“${L()[i]??'?'}”`;
const sym=re=>L().filter(s=>re.test(String(s).trim())).join(', ')||'(belum ada kelas yang cocok)';
const HOW={
  math:()=>['Soal hitung muncul di layar, misalnya 3 + 4 = ?.','Tulis jawabannya digit demi digit di udara; satu digit = satu gerakan. Contoh jawaban 12: gambar “1”, lalu gambar “2”.','Begitu jumlah digit sesuai, jawaban langsung dinilai. Ada 8 soal, 20 detik per soal; makin cepat menjawab, makin besar poinnya.','Angka yang bisa dipakai: '+sym(/^\d$/)],
  spell:()=>['Sebuah kata (atau rangkaian huruf) muncul di layar.','Tulis tiap hurufnya di udara sesuai urutan; satu huruf = satu gerakan.','Begitu jumlah huruf sesuai, jawaban dinilai. Ada 8 soal, 20 detik per soal.','Huruf yang bisa dipakai: '+sym(/^[A-Za-z]$/)],
  box:()=>['Layar menampilkan nama gerakan yang harus kamu lakukan.','Lakukan gerakan itu sebelum bar oranye habis: lawan terpukul, combo naik, dan damage makin besar.','Salah gerakan atau terlambat membuat HP-mu berkurang. Habiskan HP lawan untuk menang.'],
  flap:M=>[`Lakukan gerakan ${q(M.flap)} untuk membuat burung terbang: setiap gerakan = satu kepakan sayap yang mendorong burung naik sebentar.`,'Kalau kamu tidak melakukan gerakan apa pun, burung jatuh karena gravitasi. Jadi ulangi gerakan itu sebelum burung terlalu rendah.','Game dimulai pada gerakan pertama. Terbang melewati celah di antara pipa; menabrak pipa, lantai, atau langit = game over.','Tips: jangan menunggu sampai burung hampir jatuh, karena ada jeda sekitar satu detik dari gerakan selesai sampai burung merespons.'],
  simon:()=>['Layar menampilkan urutan gerakan satu per satu. Perhatikan dan hafalkan.','Setelah urutan selesai, ulangi persis sama dengan gerakanmu.','Tiap ronde berhasil, urutan bertambah satu gerakan. Satu kesalahan = game over.'],
  snake:M=>[`Atas: ${q(M.up)} · Bawah: ${q(M.down)} · Kiri: ${q(M.left)} · Kanan: ${q(M.right)}.`,'Ular bergerak terus sendiri; gerakanmu hanya mengubah arah (tidak bisa langsung berbalik 180°).','Makan kotak merah untuk menambah skor dan panjang. Menabrak badan sendiri = game over; menembus dinding membuat ular muncul di sisi seberang.'],
  suit:M=>[`Batu: ${q(M.rock)} · Gunting: ${q(M.sci)} · Kertas: ${q(M.pap)}.`,'Lakukan salah satu gerakan; komputer memilih acak. Batu menang atas gunting, gunting atas kertas, kertas atas batu.','Siapa lebih dulu menang 3 ronde memenangkan game.'],
  mole:()=>['Setiap lubang diberi nama sebuah gerakan.','Saat 🐭 muncul di satu lubang, lakukan gerakan yang tertulis di lubang itu sebelum bar oranye habis.','Salah lubang atau tikus kabur mengurangi 1 nyawa (total 3). Makin lama tikus makin cepat.'],
  run:M=>[`Lompat: ${q(M.jump)} — untuk rintangan merah di tanah.`,`Merunduk: ${q(M.duck)} — untuk rintangan ungu yang melayang.`,'Lakukan gerakannya sesaat sebelum rintangan tiba; efeknya bertahan sekitar satu detik. Salah aksi = tabrakan = game over.'],
  meteor:()=>['Meteor jatuh dengan nama gerakan tertulis di dalamnya.','Lakukan gerakan itu: meteor paling bawah dengan nama tersebut akan meledak.','Meteor yang menyentuh dasar mengurangi 1 nyawa (total 3). Makin lama meteor makin cepat dan banyak.'],
  race:M=>[`Kiri: ${q(M.left)} · Kanan: ${q(M.right)}.`,'Tiap gerakan menggeser mobil satu lajur (ada 3 lajur).','Hindari kotak merah; menabrak = game over. Kadang ada dua rintangan sekaligus, cari lajur yang kosong.'],
};
const readMap=()=>{const M={};document.querySelectorAll('#gmMap select').forEach(s=>{M[s.dataset.role]=Number(s.value);});return M;};
function how(){
  const g=GAMES[$('gmPick').value],box=$('gmHow');box.innerHTML='';
  const h=document.createElement('strong');h.textContent='Cara bermain';box.appendChild(h);
  const ol=document.createElement('ol');
  ['Tahan tombol BOOT → lakukan gerakan → lepas BOOT. Itu satu aksi dalam game (di mode uji keyboard, cukup tekan tombol angka kelasnya).',...HOW[g.id](readMap())].forEach(t=>{const li=document.createElement('li');li.textContent=t;ol.appendChild(li);});
  box.appendChild(ol);
}
let cur=null,hi={},sim=false,counted=false,lastPred='—',flash=0,ctx;
const hiGet=id=>{try{return Number(localStorage.getItem('nai-hi-'+id))||0;}catch(_){return 0;}};
const hiSet=(id,v)=>{try{localStorage.setItem('nai-hi-'+id,v);}catch(_){}};
const info=s=>{$('gmInfo').textContent=s;};

function buildMap(){
  const g=GAMES[$('gmPick').value],box=$('gmMap');box.innerHTML='';$('gmDesc').textContent=g.d;
  (g.roles||[]).forEach(([k,lab,re],ri)=>{
    const lb=document.createElement('label');lb.textContent=lab+' ';const sel=document.createElement('select');sel.dataset.role=k;
    L().forEach((s,i)=>{const o=document.createElement('option');o.value=i;o.textContent=s;sel.appendChild(o);});
    const gi=L().findIndex(s=>guessRe(re).test(s));sel.value=gi>=0?gi:Math.min(ri,L().length-1);
    lb.appendChild(sel);box.appendChild(lb);
  });
  how();
}
function gate(){
  const ok=ready(),pick=$('gmPick');
  $('gmGate').hidden=ok;$('gmStart').disabled=!ok;
  if(ok&&pick.dataset.labels!==L().join('|')){pick.dataset.labels=L().join('|');buildMap();}
  if(ok){
    const live=window.noodleBLE.connected&&state.deviceMode==='I';
    $('gmLive').textContent=sim?'Mode uji keyboard aktif: tombol 1–9 / 0 = kelas ke-1…ke-10.':(live?'Perangkat dalam mode INFERENCE ✔ — tahan BOOT, lakukan gerakan, lepas BOOT.':'Hubungkan perangkat & aktifkan INFERENCE MODE (tab 04), atau centang mode uji keyboard.');
  }
}
function start(){
  if(!ready())return;
  const M={};document.querySelectorAll('#gmMap select').forEach(s=>{M[s.dataset.role]=Number(s.value);});
  const g=GAMES[$('gmPick').value],o=g.mk(M),err=o.init();
  if(err){info(err);return;}
  o.id=g.id;cur=o;counted=false;info('');
}
function emit(i,conf){
  if(!cur||!ready()||i>=L().length||i<0)return;
  lastPred=`${L()[i]} (${Math.round((conf??1)*100)}%)`;flash=1;
  if(conf!=null&&conf<0.4){info(`Prediksi ragu-ragu (${Math.round(conf*100)}%) diabaikan — ulangi gerakan.`);return;}
  info('');cur.gesture(i);
}
function frame(ts){
  const dt=Math.min(.05,(ts-(frame.l||ts))/1000);frame.l=ts;
  const c=ctx;c.fillStyle='#0f172a';c.fillRect(0,0,W,H);
  if(!ready()){T(c,'🔒 Game terkunci',W/2,150,34);T(c,'Rekam data → Train model dulu (tab 02–03)',W/2,195,16,'#94a3b8');T(c,'Game memakai gerakan hasil klasifikasi MLP',W/2,220,16,'#94a3b8');}
  else if(!cur){T(c,'Pilih game, lalu tekan Mulai',W/2,H/2,24,'#94a3b8');}
  else{
    cur.update(dt);cur.draw(c);
    const b=hiGet(cur.id);
    T(c,'Skor '+cur.sc,12,26,18,'#fff','left');T(c,'Terbaik '+Math.max(b,cur.sc),W-12,26,16,'#94a3b8','right');
    if(cur.over){
      if(!counted){counted=true;if(cur.sc>b)hiSet(cur.id,cur.sc);}
      c.fillStyle='rgba(0,0,0,.82)';c.fillRect(0,0,W,H);
      T(c,cur.win?'🎉 KAMU MENANG!':'GAME OVER',W/2,160,44,cur.win?'#86efac':'#fca5a5');T(c,'Skor '+cur.sc,W/2,205,26);T(c,'Tekan Mulai untuk main lagi',W/2,245,16,'#94a3b8');
    }
  }
  flash=Math.max(0,flash-dt*2);
  $('gmPred').textContent=lastPred;$('gmPred').style.opacity=.5+flash/2;
  requestAnimationFrame(frame);
}
function init(){
  const st=document.createElement('style');
  st.textContent='.gm-wrap{padding:8px 0}.gm-bar{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin:12px 0}.gm-map{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin-bottom:12px}#gmCv{width:100%!important;height:auto!important;aspect-ratio:16/9;max-width:none!important;max-height:none!important;display:block;border-radius:12px;background:#0f172a}.gm-bar label{display:flex;align-items:center;gap:8px}.gm-bar input[type=checkbox]{width:auto;margin:0}.gm-how{margin:10px 0 14px}.gm-how ol{margin:8px 0 0 18px;padding:0;line-height:1.65}.gm-meta{display:flex;gap:18px;flex-wrap:wrap;margin-top:10px}';
  document.head.appendChild(st);
  ctx=$('gmCv').getContext('2d');ctx.setTransform(2,0,0,2,0,0);
  $('gmPick').innerHTML=GAMES.map((g,i)=>`<option value="${i}">${g.n}</option>`).join('');
  $('gmPick').addEventListener('change',()=>{cur=null;buildMap();});
  $('gmStart').addEventListener('click',start);
  $('gmMap').addEventListener('change',how);how();
  $('gmSim').addEventListener('change',e=>{sim=e.target.checked;gate();});
  window.noodleBLE.addEventListener('status',e=>{
    const t=e.detail.text;
    if(t.startsWith('P:')){const p=t.split(':');emit(Number(p[1]),Number(p[2]));}
  });
  document.addEventListener('keydown',e=>{
    if(!sim||!$('tab-games').classList.contains('active')||!/^[0-9]$/.test(e.key))return;
    emit((Number(e.key)+9)%10,1);
  });
  setInterval(gate,800);gate();requestAnimationFrame(frame);
}
document.addEventListener('DOMContentLoaded',init);
})();
