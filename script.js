var $ = id => document.getElementById(id);
const fmt = n => new Intl.NumberFormat('hr-HR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n);
const fmtX = (n,d=1) => n.toFixed(d)+'x';
const fmtPct = n => (n>=0?'+':'')+n.toFixed(1)+'%';

// NAV
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    tab.classList.add('active');
    $(tab.dataset.page).classList.add('active');
  });
});

// HELPERS
function compoundFV(annual, rateP, years) {
  let v=0;
  for(let i=0;i<years;i++) v=(v+annual)*(1+rateP/100);
  return v;
}
function compoundFVArr(annual, rateP, years) {
  let v=0, arr=[];
  for(let i=0;i<years;i++){ v=(v+annual)*(1+rateP/100); arr.push(Math.round(v)); }
  return arr;
}
const POTICAJ = 99.54;

// ============ PAGE 1 ============
let chart1;
// Helper: compute dynamic poticaj based on annual amount and toggle state
function calcPoticaj(uplata, toggleId) {
  const on = $(toggleId) ? $(toggleId).checked : true;
  if (!on) return 0;
  return uplata >= 663.61 ? 99.54 : uplata * 0.15;
}
function updatePoticajInfo(uplata, toggleId, lblId, infoId) {
  const on = $(toggleId).checked;
  const pot = calcPoticaj(uplata, toggleId);
  const lbl = $(lblId); const info = $(infoId);
  if (lbl) { lbl.textContent = on ? 'Uključen' : 'Isključen'; lbl.className = 'toggle-label' + (on ? ' active' : ''); }
  if (info) {
    if (!on) { info.textContent = 'Poticaj nije uračunat'; }
    else if (uplata >= 663.61) { info.textContent = `Max poticaj: 99.54€/god (uplata ≥ 663.61€)`; }
    else { info.textContent = `Poticaj: 15% × ${uplata.toFixed(2)}€ = ${pot.toFixed(2)}€/god`; }
  }
}

function updateP1() {
  const uplata = parseFloat($('p1-uplata').value) || 0;
  const god = parseInt($('p1-god-v').value) || parseInt($('p1-god').value) || 30;
  const dmfR = parseFloat($('p1-dmfr-v').value) || parseFloat($('p1-dmfr').value) || 3.5;
  const peppGrossR = parseFloat($('p1-peppr-v').value) || parseFloat($('p1-peppr').value) || 8.0;
  const peppR = Math.max(peppGrossR - 1, 0); // 1% Finax naknada
  const pot = calcPoticaj(uplata, 'p1-poticaj-toggle');
  updatePoticajInfo(uplata, 'p1-poticaj-toggle', 'p1-poticaj-lbl', 'p1-poticaj-info');

  if ($('p1-pepp-rate-note')) {
    $('p1-pepp-rate-note').textContent = `Nakon 1% Finax naknade: ${peppR.toFixed(2)}%/god`;
  }

  const dmfFinal = compoundFV(uplata+pot, dmfR, god);
  const peppFinal = compoundFV(uplata, peppR, god);
  const dmfIn = uplata*god;

  $('p1-dmf-total').textContent = fmt(dmfFinal);
  $('p1-dmf-earn').textContent = fmt(dmfFinal-dmfIn);
  $('p1-dmf-in').textContent = fmt(dmfIn);
  $('p1-dmf-pot').textContent = 'poticaj: '+fmt(pot*god);
  $('p1-pepp-total').textContent = fmt(peppFinal);
  $('p1-pepp-earn').textContent = fmt(peppFinal-dmfIn);
  $('p1-pepp-in').textContent = fmt(dmfIn);

  const diff = Math.abs(peppFinal-dmfFinal);
  const winner = peppFinal>dmfFinal?'PEPP':'3. stup';
  const winnerColor = peppFinal>dmfFinal?'var(--pepp-l)':'var(--dmf-l)';
  $('p1-diff').textContent = fmt(diff);
  $('p1-diff').style.color = winnerColor;
  const potTxt = pot>0 ? ` Godišnji poticaj: <strong>${fmt(pot)}</strong> (ukupno ${fmt(pot*god)}).` : ' Poticaj isključen.';
  $('p1-desc').innerHTML = `<strong style="color:${winnerColor}">${winner}</strong> završava s više novca — ${((diff/Math.min(peppFinal,dmfFinal))*100).toFixed(1)}% razlika.${potTxt}`;

  const milestones = [5,10,15,20,25,30,35,40,50,60].filter(y=>y<=god);
  if(!milestones.includes(god)) milestones.push(god);
  $('p1-tbody').innerHTML = milestones.map(y=>{
    const d=compoundFV(uplata+pot,dmfR,y);
    const p=compoundFV(uplata,peppR,y);
    const dif=p-d;
    return `<tr><td>${y}. god</td><td style="color:var(--dmf-l)">${fmt(d)}</td><td style="color:var(--pepp-l)">${fmt(p)}</td><td style="color:${dif>0?'var(--etf-l)':'var(--dmf-l)'}">${dif>0?'+':''}${fmt(dif)}</td></tr>`;
  }).join('');

  const labels=[], dmfArr=[], peppArr=[];
  for(let i=1;i<=god;i++){
    labels.push(i);
    dmfArr.push(Math.round(compoundFV(uplata+pot,dmfR,i)));
    peppArr.push(Math.round(compoundFV(uplata,peppR,i)));
  }
  const ds = [
    {label:'3. Stup (DMF)',data:dmfArr,borderColor:'#e8a44a',backgroundColor:'rgba(232,164,74,0.07)',fill:true,borderWidth:2.5,pointRadius:0,tension:0.4},
    {label:'PEPP',data:peppArr,borderColor:'#4a9fe8',backgroundColor:'rgba(74,159,232,0.07)',fill:true,borderWidth:2.5,pointRadius:0,tension:0.4},
  ];
  if(!chart1){ chart1=makeChart('p1-chart',labels,ds); storeChartData('p1-chart', labels, ds); }
  else { chart1.data.labels=labels; chart1.data.datasets.forEach((d,i)=>{ d.data=ds[i].data; }); chart1.update(); }
}
['p1-uplata','p1-god','p1-dmfr','p1-peppr'].forEach(id => $(id).addEventListener('syncedInput', updateP1));
$('p1-poticaj-toggle').addEventListener('change', updateP1);

// ============ PAGE 2 ============
let chart2;
const p2vis = {dmf:true, pepp:true, etf:true};
document.querySelectorAll('#p2-toggles .toggle-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const k=btn.dataset.key;
    p2vis[k]=!p2vis[k];
    btn.classList.toggle('active',p2vis[k]);
    updateP2();
  });
});

$('p2-etf-select').addEventListener('change', ()=>{
  const isCustom = $('p2-etf-select').value==='9.0' && $('p2-etf-select').selectedIndex===8;
  const sel = $('p2-etf-select');
  $('p2-etf-custom-wrap').style.display = sel.options[sel.selectedIndex].text.includes('Vlastiti') ? 'flex' : 'none';
  updateP2();
});
$('p2-etfr-custom').addEventListener('syncedInput',()=>{


  updateP2();
});

function getP2EtfRate() {
  const sel = $('p2-etf-select');
  if(sel.options[sel.selectedIndex].text.includes('Vlastiti')) return +$('p2-etfr-custom').value;
  return +sel.value;
}
function getP2EtfName() {
  const sel = $('p2-etf-select');
  return sel.options[sel.selectedIndex].text.split(' —')[0].split(' (')[0];
}

function updateP2() {
  const uplata=+$('p2-uplata').value, god=+$('p2-god').value;
  const dmfR=+$('p2-dmfr').value;
  const peppGrossR=+$('p2-peppr').value;
  const peppR=Math.max(peppGrossR-1,0); // 1% Finax naknada
  const etfR=getP2EtfRate();








  const pot2=calcPoticaj(uplata,'p2-poticaj-toggle'); updatePoticajInfo(uplata,'p2-poticaj-toggle','p2-poticaj-lbl','p2-poticaj-info');
  const dmfFinal=compoundFV(uplata+pot2,dmfR,god);
  const peppFinal=compoundFV(uplata,peppR,god);
  const etfFinal=compoundFV(uplata,etfR,god);
  const inp=uplata*god;
  const etfName=getP2EtfName();
  $('p2-etf-name').textContent=etfName;

  if ($('p2-pepp-rate-note')) {
    $('p2-pepp-rate-note').textContent = `Nakon 1% Finax naknade: ${peppR.toFixed(2)}%/god`;
  }

  $('p2-dmf-total').textContent=fmt(dmfFinal);
  $('p2-dmf-earn').textContent=fmt(dmfFinal-inp);
  $('p2-dmf-multi').textContent=fmtX(dmfFinal/inp);
  $('p2-pepp-total').textContent=fmt(peppFinal);
  $('p2-pepp-earn').textContent=fmt(peppFinal-inp);
  $('p2-pepp-multi').textContent=fmtX(peppFinal/inp);
  $('p2-etf-total').textContent=fmt(etfFinal);
  $('p2-etf-earn').textContent=fmt(etfFinal-inp);
  $('p2-etf-multi').textContent=fmtX(etfFinal/inp);

  $('p2-sc-dmf').classList.toggle('hidden',!p2vis.dmf);
  $('p2-sc-pepp').classList.toggle('hidden',!p2vis.pepp);
  $('p2-sc-etf').classList.toggle('hidden',!p2vis.etf);

  const vals={dmf:dmfFinal,pepp:peppFinal,etf:etfFinal};
  const names={dmf:'3. Stup',pepp:'PEPP',etf:etfName};
  const cols={dmf:'var(--dmf-l)',pepp:'var(--pepp-l)',etf:'var(--etf-l)'};
  const visVals=Object.entries(vals).filter(([k])=>p2vis[k]);
  if(visVals.length) {
    const [wk,wv]=visVals.reduce((a,b)=>b[1]>a[1]?b:a);
    const [lk,lv]=visVals.reduce((a,b)=>b[1]<a[1]?b:a);
    $('p2-winner').textContent=names[wk];
    $('p2-winner').style.color=cols[wk];
    $('p2-desc').innerHTML=`<strong style="color:${cols[wk]}">${names[wk]}</strong> vodi za <strong>${fmt(wv-lv)}</strong> ispred <strong style="color:${cols[lk]}">${names[lk]}</strong>. To je ${((wv/lv-1)*100).toFixed(1)}% razlike.`;
  }

  const milestones=[5,10,15,20,25,30,35,40].filter(y=>y<=god);
  if(!milestones.includes(god)) milestones.push(god);
  $('p2-tbody').innerHTML=milestones.map(y=>{
    const d=compoundFV(uplata+calcPoticaj(uplata,'p2-poticaj-toggle'),dmfR,y);
    const p=compoundFV(uplata,peppR,y);
    const e=compoundFV(uplata,etfR,y);
    return `<tr><td>${y}.</td>
      <td style="color:var(--dmf-l);opacity:${p2vis.dmf?1:0.3}">${fmt(d)}</td>
      <td style="color:var(--pepp-l);opacity:${p2vis.pepp?1:0.3}">${fmt(p)}</td>
      <td style="color:var(--etf-l);opacity:${p2vis.etf?1:0.3}">${fmt(e)}</td></tr>`;
  }).join('');

  const labels=[];
  const dmfArr=[],peppArr=[],etfArr=[];
  for(let i=1;i<=god;i++){
    labels.push(i);
    dmfArr.push(Math.round(compoundFV(uplata+calcPoticaj(uplata,'p2-poticaj-toggle'),dmfR,i)));
    peppArr.push(Math.round(compoundFV(uplata,peppR,i)));
    etfArr.push(Math.round(compoundFV(uplata,etfR,i)));
  }
  const ds=[
    {label:'3. Stup',data:dmfArr,borderColor:'#e8a44a',backgroundColor:'rgba(232,164,74,0.06)',fill:true,borderWidth:p2vis.dmf?2.5:0,pointRadius:0,tension:0.4,hidden:!p2vis.dmf},
    {label:'PEPP',data:peppArr,borderColor:'#4a9fe8',backgroundColor:'rgba(74,159,232,0.06)',fill:true,borderWidth:p2vis.pepp?2.5:0,pointRadius:0,tension:0.4,hidden:!p2vis.pepp},
    {label:getP2EtfName(),data:etfArr,borderColor:'#4ae8a0',backgroundColor:'rgba(74,232,160,0.06)',fill:true,borderWidth:p2vis.etf?2.5:0,pointRadius:0,tension:0.4,hidden:!p2vis.etf},
  ];
  if(!chart2){ chart2=makeChart('p2-chart',labels,ds); storeChartData('p2-chart', labels, ds); }
  else {
    chart2.data.labels=labels;
    chart2.data.datasets.forEach((d,i)=>{ d.data=ds[i].data; d.label=ds[i].label; d.hidden=ds[i].hidden; d.borderWidth=ds[i].borderWidth; });
    chart2.update();
  }
}
['p2-uplata','p2-god','p2-dmfr','p2-peppr'].forEach(id => $(id).addEventListener('syncedInput', updateP2));
$('p2-poticaj-toggle').addEventListener('change', updateP2);

// ============ PAGE 3 ============
let chart3;

$('p3-etf-select').addEventListener('change',()=>{
  const sel=$('p3-etf-select');
  $('p3-etf-custom-wrap').style.display=sel.value==='custom'?'flex':'none';
  updateP3();
});
$('p3-etfr-custom').addEventListener('syncedInput',()=>{
 updateP3(); });
$('p3-pension-type').addEventListener('change',updateP3);

function getP3EtfRate(){ const sel=$('p3-etf-select'); return sel.value==='custom'?+$('p3-etfr-custom').value:+sel.value; }
function getP3EtfName(){ const sel=$('p3-etf-select'); return sel.options[sel.selectedIndex].text.split(' (')[0]; }

function updateP3() {
  const uplata=+$('p3-uplata').value, god=+$('p3-god').value;
  const etfShare=(parseFloat($('p3-etf-share-v').value)||parseFloat($('p3-etf-share').value)||60)/100;
  const penShare=1-etfShare;
  const penType=$('p3-pension-type').value;
  const penR=parseFloat($('p3-penr-v').value)||parseFloat($('p3-penr').value)||8.0;
  const etfR=getP3EtfRate();
  const inf=parseFloat($('p3-inf-v').value)||parseFloat($('p3-inf').value)||2.5;
  const etfName=getP3EtfName();











  const penUplata=uplata*penShare;
  const etfUplata=uplata*etfShare;
  const penBonus=penType==='dmf'?POTICAJ*penShare:0;

  // Alloc bar
  const penLabel=penType==='dmf'?'3. Stup DMF':'PEPP';
  const penColor=penType==='dmf'?'var(--dmf-l)':'var(--pepp-l)';
  const penBorderColor=penType==='dmf'?'var(--dmf)':'var(--pepp)';
  $('p3-pension-label').textContent=penLabel;
  $('p3-pension-label').style.color=penColor;
  $('p3-bar-pension').style.width=(penShare*100)+'%';
  $('p3-bar-pension').style.background=penBorderColor;
  $('p3-pension-pct').textContent=Math.round(penShare*100)+'%';
  $('p3-pension-pct').style.color=penColor;
  $('p3-pension-eur').textContent=fmt(penUplata)+'/god';
  $('p3-pension-eur').style.color=penColor;
  $('p3-bar-etf').style.width=(etfShare*100)+'%';
  $('p3-etf-pct').textContent=Math.round(etfShare*100)+'%';
  $('p3-etf-eur').textContent=fmt(etfUplata)+'/god';
  $('p3-etf-alloc-label').textContent='ETF ('+etfName+')';
  $('p3-etf-name').textContent=etfName;
  $('p3-sc-pen-lbl').textContent=penLabel;
  $('p3-th-pen').textContent=penLabel;
  $('p3-sc-pension').className='stat-card '+(penType==='dmf'?'sc-dmf':'sc-pepp');

  const penFinal=compoundFV(penUplata+penBonus,penR,god);
  const etfFinal=compoundFV(etfUplata,etfR,god);
  const combined=penFinal+etfFinal;
  const inp=uplata*god;
  const realFactor=Math.pow(1+inf/100,god);
  const realVal=combined/realFactor;

  $('p3-pen-total').textContent=fmt(penFinal);
  $('p3-pen-earn').textContent=fmt(penFinal-penUplata*god);
  $('p3-etf-total').textContent=fmt(etfFinal);
  $('p3-etf-earn').textContent=fmt(etfFinal-etfUplata*god);
  $('p3-total').textContent=fmt(combined);
  $('p3-real').textContent=fmt(realVal);
  $('p3-in').textContent=fmt(inp);
  $('p3-payout-total').textContent=fmt(combined);
  $('p3-lump').textContent=fmt(combined);
  const monthly=combined*0.04/12;
  const monthlyReal=realVal*0.04/12;
  $('p3-monthly').textContent=fmt(monthly)+'/mj';
  $('p3-monthly-real').textContent=fmt(monthlyReal)+'/mj';

  // Compare: all pension
  const onlyPen=compoundFV(uplata+(penType==='dmf'?POTICAJ:0),penR,god);
  const onlyEtf=compoundFV(uplata,etfR,god);
  $('p3-only-pen').textContent=fmt(onlyPen);
  $('p3-pen-monthly').textContent=fmt(onlyPen*0.04/12)+'/mj';
  const penDiff=onlyPen-combined;
  $('p3-pen-diff').textContent=(penDiff>0?'+':'')+fmt(penDiff);
  $('p3-pen-diff').style.color=penDiff>0?'var(--etf-l)':'var(--red)';
  $('p3-only-etf').textContent=fmt(onlyEtf);
  $('p3-etf-monthly').textContent=fmt(onlyEtf*0.04/12)+'/mj';
  const etfDiff=onlyEtf-combined;
  $('p3-etf-only-diff').textContent=(etfDiff>0?'+':'')+fmt(etfDiff);
  $('p3-etf-only-diff').style.color=etfDiff>0?'var(--etf-l)':'var(--red)';

  // Chart + table
  const milestones=[5,10,15,20,25,30,35,40].filter(y=>y<=god);
  if(!milestones.includes(god)) milestones.push(god);
  $('p3-tbody').innerHTML=milestones.map(y=>{
    const pv=compoundFV(penUplata+penBonus,penR,y);
    const ev=compoundFV(etfUplata,etfR,y);
    const cv=pv+ev; const rf=Math.pow(1+inf/100,y);
    return `<tr><td>${y}.</td>
      <td style="color:${penColor}">${fmt(pv)}</td>
      <td style="color:var(--etf-l)">${fmt(ev)}</td>
      <td style="color:var(--combo-l)">${fmt(cv)}</td>
      <td style="color:var(--muted2)">${fmt(cv/rf)}</td></tr>`;
  }).join('');

  const labels=[],penArr=[],etfArr2=[],comboArr=[],realArr=[];
  for(let i=1;i<=god;i++){
    labels.push(i);
    const pv=compoundFV(penUplata+penBonus,penR,i);
    const ev=compoundFV(etfUplata,etfR,i);
    penArr.push(Math.round(pv));
    etfArr2.push(Math.round(ev));
    comboArr.push(Math.round(pv+ev));
    realArr.push(Math.round((pv+ev)/Math.pow(1+inf/100,i)));
  }
  const penC=penType==='dmf'?'#e8a44a':'#4a9fe8';
  const penBg=penType==='dmf'?'rgba(232,164,74,0.06)':'rgba(74,159,232,0.06)';
  const ds=[
    {label:penLabel,data:penArr,borderColor:penC,backgroundColor:penBg,fill:true,borderWidth:2,pointRadius:0,tension:0.4},
    {label:'ETF ('+etfName+')',data:etfArr2,borderColor:'#4ae8a0',backgroundColor:'rgba(74,232,160,0.06)',fill:true,borderWidth:2,pointRadius:0,tension:0.4},
    {label:'Kombinirano',data:comboArr,borderColor:'#c77af5',backgroundColor:'rgba(199,122,245,0.08)',fill:true,borderWidth:2.5,pointRadius:0,tension:0.4},
    {label:'Realna vrijednost',data:realArr,borderColor:'#5a6180',backgroundColor:'transparent',fill:false,borderWidth:1.5,pointRadius:0,tension:0.4,borderDash:[5,4]},
  ];
  if(!chart3){ chart3=makeChart('p3-chart',labels,ds); storeChartData('p3-chart', labels, ds); }
  else{
    chart3.data.labels=labels;
    chart3.data.datasets.forEach((d,i)=>{ d.data=ds[i].data; d.label=ds[i].label; d.borderColor=ds[i].borderColor; d.backgroundColor=ds[i].backgroundColor; if(ds[i].borderDash) d.borderDash=ds[i].borderDash; });
    chart3.update();
  }
}
['p3-uplata','p3-god','p3-etf-share','p3-penr','p3-inf'].forEach(id => $(id).addEventListener('syncedInput', updateP3));

// ============ CHART FACTORY ============
function makeChart(canvasId, labels, datasets) {
  return new Chart($(canvasId), {
    type:'line',
    data:{ labels, datasets },
    options:{
      responsive:true,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{ labels:{ color:'#5a6180', font:{ family:'DM Sans', size:11 }, padding:16, boxWidth:12 } },
        tooltip:{
          backgroundColor:'#1a1e2a', borderColor:'#242a3d', borderWidth:1,
          titleColor:'#e2e5f0', bodyColor:'#8890b0', padding:12,
          callbacks:{ label: ctx=>' '+ctx.dataset.label+': '+fmt(ctx.raw) }
        },
        zoom: (typeof ChartZoom !== 'undefined' || (Chart.registry && Chart.registry.plugins && Chart.registry.plugins.get && Chart.registry.plugins.get('zoom'))) ? {
          pan:{ enabled:true, mode:'x', threshold:5,
            onPan: ({chart}) => {
              const wrap = chart.canvas.closest('.chart-card');
              if(wrap){ const btn=wrap.querySelector('.zoom-reset-btn'); if(btn) btn.classList.add('visible'); }
            }
          },
          zoom:{
            wheel:{ enabled:true, speed:0.05 },
            pinch:{ enabled:true },
            drag:{ enabled:false },
            mode:'x',
            onZoom: ({chart}) => {
              const wrap = chart.canvas.closest('.chart-card');
              if(wrap){ const btn=wrap.querySelector('.zoom-reset-btn'); if(btn) btn.classList.add('visible'); }
            }
          }
        } : {}
      },
      scales:{
        x:{ ticks:{color:'#5a6180',font:{family:'DM Mono',size:10},maxTicksLimit:10}, grid:{color:'#1a1e2a'}, title:{display:true,text:'Godina',color:'#5a6180',font:{size:11}} },
        y:{ ticks:{ color:'#5a6180', font:{family:'DM Mono',size:10}, callback: v=>v>=1000000?(v/1000000).toFixed(1)+'M €':v>=1000?(v/1000).toFixed(0)+'k €':v+'€' }, grid:{color:'#1a1e2a'} }
      }
    }
  });
}

// ============ PAGE 0A: HRVATSKI DMF ============
let chartP0aAll, chartP0a;

const DMF_FUNDS = [
  {name:'Croatia 1000A', r2024:11.5, r5y:5.35, rAll:5.77, risk:'VISOK', color:'#4ae8a0'},
  {name:'Erste Plavi Expert', r2024:10.44, r5y:6.62, rAll:5.30, risk:'VISOK', color:'#4a9fe8'},
  {name:'AZ Profit', r2024:8.89, r5y:4.51, rAll:5.10, risk:'UMJEREN', color:'#e8a44a'},
  {name:'Croatia DMF', r2024:7.72, r5y:4.12, rAll:3.67, risk:'UMJEREN', color:'#f5c87a'},
  {name:'AZ Benefit', r2024:4.14, r5y:3.20, rAll:3.00, risk:'NIZAK', color:'#7abff5'},
  {name:'Raiffeisen DMF', r2024:3.36, r5y:3.00, rAll:2.80, risk:'NIZAK', color:'#8890b0'},
  {name:'Erste Plavi Protect', r2024:3.32, r5y:2.80, rAll:2.60, risk:'NIZAK', color:'#6b7394'},
  {name:'Croatia 1000C', r2024:3.13, r5y:2.50, rAll:2.50, risk:'NIZAK', color:'#5a6180'},
];

function updateP0a() {
  const sel = $('p0a-fund-select');
  const [r2024, r5y] = sel.value.split(',').map(Number);
  const fundName = sel.options[sel.selectedIndex].text.split(' (')[0];
  const period = $('p0a-period').value;
  const inputAmt = parseFloat(($('p0a-uplata-v').value+'').replace(',','.')) || parseFloat($('p0a-uplata').value) || 663;
  const initial = parseFloat($('p0a-initial-v').value) || parseFloat($('p0a-initial').value) || 0;
  const god = parseInt($('p0a-god-v').value) || parseInt($('p0a-god').value) || 25;
  const usePoticaj = $('p0a-poticaj').value === 'yes';

  // Annual amount
  const annualUplata = period === 'mjesecno' ? inputAmt * 12 : inputAmt;
  const label = period === 'mjesecno' ? inputAmt+'€/mj' : inputAmt+'€/god';



  $('p0a-fund-name').textContent = fundName;

  const poticajGod = usePoticaj && annualUplata >= 663.61 ? 99.54 : (usePoticaj ? annualUplata*0.15 : 0);
  const rate = r5y; // use 5y average as projection

  // Compute growth
  let val = initial;
  let totalIn = initial;
  const milestones = [5,10,15,20,25,30,35,40].filter(y=>y<=god);
  if(!milestones.includes(god)) milestones.push(god);
  const labels=[], vals=[], tbody=[];
  let totalPoticaj=0;

  for(let i=1;i<=god;i++){
    val = (val + annualUplata + poticajGod) * (1 + rate/100);
    totalIn += annualUplata;
    totalPoticaj += poticajGod;
    labels.push(i);
    vals.push(Math.round(val));
    if(milestones.includes(i)){
      const inp = initial + annualUplata*i;
      tbody.push(`<tr><td>${i}. god</td><td style="color:var(--muted2)">${fmt(inp)}</td><td style="color:var(--etf-l)">${fmt(poticajGod*i)}</td><td style="color:var(--dmf-l)">${fmt(val)}</td><td style="color:var(--etf-l)">${fmt(val-inp)}</td></tr>`);
    }
  }

  $('p0a-total').textContent = fmt(val);
  $('p0a-earn').textContent = fmt(val - totalIn);
  $('p0a-multi').textContent = (val/totalIn).toFixed(2)+'x';
  $('p0a-in').textContent = fmt(totalIn);
  $('p0a-poticaj-val').textContent = fmt(totalPoticaj);
  $('p0a-total-in').textContent = fmt(totalIn + totalPoticaj);
  $('p0a-lump').textContent = fmt(val);
  $('p0a-monthly').textContent = fmt(val*0.04/12)+'/mj';
  $('p0a-rate-used').textContent = rate.toFixed(2)+'%/god';
  $('p0a-info').innerHTML = `Korišten <strong>5-godišnji prosjek</strong> fonda (${r5y}%). Prinos 2024: <strong>${r2024}%</strong>. ${usePoticaj?`Godišnji poticaj: <strong>${fmt(poticajGod)}</strong>.`:''}`;
  $('p0a-tbody').innerHTML = tbody.join('');

  // Chart single fund
  if(!chartP0a){ chartP0a=makeChart('p0a-chart',labels,[{label:fundName,data:vals,borderColor:'#e8a44a',backgroundColor:'rgba(232,164,74,0.08)',fill:true,borderWidth:2.5,pointRadius:0,tension:0.4}]); }
  else{ chartP0a.data.labels=labels; chartP0a.data.datasets[0].data=vals; chartP0a.data.datasets[0].label=fundName; chartP0a.update(); }

  // All-funds comparison chart
  const allLabels=[];
  for(let i=1;i<=god;i++) allLabels.push(i);
  const allDS = DMF_FUNDS.map(f=>{
    let v=initial;
    const pot=usePoticaj&&annualUplata>=663.61?99.54:(usePoticaj?annualUplata*0.15:0);
    const arr=[];
    for(let i=1;i<=god;i++){ v=(v+annualUplata+pot)*(1+f.r5y/100); arr.push(Math.round(v)); }
    return {label:f.name,data:arr,borderColor:f.color,backgroundColor:'transparent',fill:false,borderWidth:1.8,pointRadius:0,tension:0.4};
  });
  if(!chartP0aAll){ chartP0aAll=makeChart('p0a-chart-all',allLabels,allDS); }
  else{ chartP0aAll.data.labels=allLabels; chartP0aAll.data.datasets.forEach((d,i)=>{d.data=allDS[i].data;}); chartP0aAll.update(); }
}

['p0a-uplata','p0a-initial','p0a-god'].forEach(id => $(id).addEventListener('syncedInput', updateP0a));
['p0a-fund-select','p0a-period','p0a-poticaj'].forEach(id=>$(id).addEventListener('change',updateP0a));

// ============ PAGE 0B: ETF PLATFORME ============
let chartP0b, chartP0bPlatforms;

const PLATFORMS = {
  ibkr:    {name:'IBKR', annualFee:0, txFee:0.0005, minTx:3, withdrawFee:8, insurance:'20.000€ (IBIE/EU)', color:'#4ae8a0'},
  t212:    {name:'Trading 212 (bank)', annualFee:0, txFee:0, minTx:0, withdrawFee:0, insurance:'20.000€ ICF + Lloyd\'s 1M GBP', color:'#4a9fe8'},
  t212card:{name:'Trading 212 (kartica)', annualFee:0, txFee:0.007, minTx:0, withdrawFee:0, insurance:'20.000€ ICF + Lloyd\'s 1M GBP', color:'#7abff5'},
  finax:   {name:'Finax', annualFee:0.012, txFee:0, minTx:0, withdrawFee:0, insurance:'20.000€ (NBS SR)', color:'#c77af5'},
};

function getP0bEtfData() {
  const sel=$('p0b-etf-select');
  const vals=sel.value.split(',');
  if(vals[0]==='custom') return {rate:+$('p0b-custom-r').value, risk:'VLASTITI', name:'Vlastiti ETF'};
  return {rate:+vals[0], risk:vals[1], name:vals[2]};
}

function calcP0bGrowth(annualUplata, initial, rate, annualFeeRate, txFeeRate, god) {
  let val=initial, totalFees=0;
  // tx fee on initial
  const initFee=Math.max(PLATFORMS[($('p0b-platform').value)].minTx, initial*txFeeRate);
  totalFees+=initFee; val-=initFee;
  const arr=[];
  for(let i=0;i<god;i++){
    const txF=Math.max(PLATFORMS[$('p0b-platform').value].minTx, annualUplata*txFeeRate);
    val=(val+annualUplata-txF)*(1+rate/100);
    const mgmtF=val*annualFeeRate;
    val-=mgmtF;
    totalFees+=txF+mgmtF;
    arr.push({val:Math.round(val),fees:Math.round(totalFees)});
  }
  return arr;
}

function updateP0b() {
  const etf=getP0bEtfData();
  const plKey=$('p0b-platform').value;
  const pl=PLATFORMS[plKey];
  const uplata=parseFloat($('p0b-uplata-v').value)||parseFloat($('p0b-uplata').value)||1200;
  const initial=parseFloat($('p0b-initial-v').value)||parseFloat($('p0b-initial').value)||1000;
  const god=parseInt($('p0b-god-v').value)||parseInt($('p0b-god').value)||20;
  const taxRate=+$('p0b-tax').value/100;








  const sel=$('p0b-etf-select');
  $('p0b-etf-custom-wrap').style.display=sel.value.startsWith('custom')?'flex':'none';

  $('p0b-etf-name').textContent=etf.name;
  $('p0b-gross-rate').textContent=etf.rate+'% bruto/god';
  $('p0b-fee-display').textContent=((pl.annualFee+pl.txFee)*100).toFixed(2)+'%/god eff.';
  $('p0b-insurance').textContent=pl.insurance;

  const riskMap={'VISOK':'🔴 Visok rizik','SREDNJI':'🟡 Srednji rizik','NIZAK':'🟢 Nizak rizik','VLASTITI':'⚪ Vlastiti'};
  $('p0b-risk-badge').textContent=riskMap[etf.risk]||etf.risk;

  // Bruto (no fees)
  let brutoVal=initial;
  for(let i=0;i<god;i++) brutoVal=(brutoVal+uplata)*(1+etf.rate/100);

  // Neto with fees
  const arr=calcP0bGrowth(uplata,initial,etf.rate,pl.annualFee,pl.txFee,god);
  const netoVal=arr[arr.length-1].val;
  const totalFees=arr[arr.length-1].fees;
  const totalIn=initial+uplata*god;
  const gain=netoVal-totalIn;
  const afterTax=totalIn+gain*(1-taxRate);

  $('p0b-gross').textContent=fmt(Math.round(brutoVal));
  $('p0b-net').textContent=fmt(netoVal);
  $('p0b-after-tax').textContent=fmt(afterTax);
  $('p0b-in').textContent=fmt(totalIn);
  $('p0b-earn').textContent=fmt(netoVal-totalIn);
  $('p0b-multi').textContent=(netoVal/totalIn).toFixed(2)+'x';
  $('p0b-fees-total').textContent=fmt(totalFees);
  $('p0b-fees-pct').textContent=((totalFees/(netoVal-totalIn+totalFees))*100).toFixed(1)+'% zarade';
  $('p0b-monthly').textContent=fmt(afterTax*0.04/12)+'/mj';

  // Table
  const mils=[2,5,10,15,20,25,30,35,40].filter(y=>y<=god);
  if(!mils.includes(god)) mils.push(god);
  $('p0b-tbody').innerHTML=mils.map(y=>{
    const a=arr[y-1];
    let b=initial; for(let i=0;i<y;i++) b=(b+uplata)*(1+etf.rate/100);
    const inp2=initial+uplata*y;
    const g2=a.val-inp2;
    return `<tr><td>${y}.</td><td style="color:var(--muted2)">${fmt(inp2)}</td><td style="color:var(--etf-l)">${fmt(Math.round(b))}</td><td style="color:var(--pepp-l)">${fmt(a.val)}</td><td style="color:var(--red)">${fmt(a.fees)}</td><td style="color:var(--etf-l)">${fmt(inp2+g2*(1-taxRate))}</td></tr>`;
  }).join('');

  // Chart single
  const labels=[];
  const brutoArr=[],netoArr=[],afterArr=[];
  let bv=initial;
  for(let i=1;i<=god;i++){
    labels.push(i);
    bv=(bv+uplata)*(1+etf.rate/100);
    brutoArr.push(Math.round(bv));
    netoArr.push(arr[i-1].val);
    const ii=initial+uplata*i; const gg=arr[i-1].val-ii;
    afterArr.push(Math.round(ii+gg*(1-taxRate)));
  }
  const ds=[
    {label:'Bruto',data:brutoArr,borderColor:'#4ae8a0',backgroundColor:'rgba(74,232,160,0.06)',fill:true,borderWidth:2,pointRadius:0,tension:0.4},
    {label:'Neto (naknade)',data:netoArr,borderColor:'#4a9fe8',backgroundColor:'rgba(74,159,232,0.06)',fill:true,borderWidth:2,pointRadius:0,tension:0.4},
    {label:'Neto (porez)',data:afterArr,borderColor:'#e8a44a',backgroundColor:'transparent',fill:false,borderWidth:1.5,pointRadius:0,tension:0.4,borderDash:[4,3]},
  ];
  if(!chartP0b){ chartP0b=makeChart('p0b-chart',labels,ds); storeChartData('p0b-chart', labels, ds); }
  else{ chartP0b.data.labels=labels; chartP0b.data.datasets.forEach((d,i)=>{d.data=ds[i].data;}); chartP0b.update(); }

  // Platform comparison chart
  const plKeys=['ibkr','t212','t212card','finax'];
  const plColors=['#4ae8a0','#4a9fe8','#7abff5','#c77af5'];
  const plLabels=[];
  for(let i=1;i<=god;i++) plLabels.push(i);
  const plDS=plKeys.map((pk,idx)=>{
    const p=PLATFORMS[pk];
    const a=[];
    let v=initial;
    const initTx=Math.max(p.minTx,initial*p.txFee); v-=initTx;
    for(let i=0;i<god;i++){
      const tx=Math.max(p.minTx,uplata*p.txFee);
      v=(v+uplata-tx)*(1+etf.rate/100);
      v-=v*p.annualFee;
      a.push(Math.round(v));
    }
    return {label:p.name,data:a,borderColor:plColors[idx],backgroundColor:'transparent',fill:false,borderWidth:plKey===pk?3:1.5,pointRadius:0,tension:0.4};
  });
  if(!chartP0bPlatforms){ chartP0bPlatforms=makeChart('p0b-chart-platforms',plLabels,plDS); }
  else{ chartP0bPlatforms.data.labels=plLabels; chartP0bPlatforms.data.datasets.forEach((d,i)=>{d.data=plDS[i].data;d.label=plDS[i].label;d.borderWidth=plDS[i].borderWidth;}); chartP0bPlatforms.update(); }
}

['p0b-uplata','p0b-initial','p0b-god','p0b-custom-r'].forEach(id => $(id).addEventListener('syncedInput', updateP0b));
['p0b-etf-select','p0b-platform','p0b-tax'].forEach(id=>$(id).addEventListener('change',updateP0b));

// ============ SLIDER <-> NUMBER INPUT SYNC ============
const SLIDER_PAIRS = [
  ['p0a-uplata','p0a-uplata-v',10,5000,0.01],
  ['p0a-initial','p0a-initial-v',0,20000,0.01],
  ['p0a-god','p0a-god-v',5,60,1],
  ['p0b-uplata','p0b-uplata-v',100,5000,0.01],
  ['p0b-initial','p0b-initial-v',0,20000,0.01],
  ['p0b-god','p0b-god-v',2,60,1],
  ['p0b-custom-r','p0b-custom-r-v',2,18,0.1],
  ['p1-uplata','p1-uplata-v',200,5000,0.01],
  ['p1-god','p1-god-v',5,60,1],
  ['p1-dmfr','p1-dmfr-v',1,8,0.1],
  ['p1-peppr','p1-peppr-v',3,14,0.1],
  ['p2-uplata','p2-uplata-v',200,5000,0.01],
  ['p2-god','p2-god-v',5,60,1],
  ['p2-dmfr','p2-dmfr-v',1,8,0.1],
  ['p2-peppr','p2-peppr-v',3,14,0.1],
  ['p2-etfr-custom','p2-etfr-custom-v',3,18,0.1],
  ['p3-uplata','p3-uplata-v',500,5000,0.01],
  ['p3-god','p3-god-v',5,60,1],
  ['p3-etf-share','p3-etf-share-v',0,100,1],
  ['p3-penr','p3-penr-v',1,12,0.1],
  ['p3-inf','p3-inf-v',0,5,0.1],
  ['p3-etfr-custom','p3-etfr-custom-v',3,18,0.1],
];

// Override $ for sliders to always read from slider element
// We'll add a getVal helper that reads the number input (authoritative source)
function getVal(numberId) {
  const el = $(numberId);
  if (!el) return 0;
  return parseFloat(el.value) || 0;
}

function setupSyncPairs() {
  SLIDER_PAIRS.forEach(([sliderId, numId, mn, mx, step]) => {
    const slider = $(sliderId);
    const numInput = $(numId);
    if (!slider || !numInput) return;

    // Initialize number input from slider
    {
      const sv = parseFloat(slider.value);
      const dec = parseInt(numInput.dataset.decimals || '0');
      if (dec >= 2 || step <= 0.01) numInput.value = sv.toFixed(2);
      else if (step <= 0.1) numInput.value = sv.toFixed(1);
      else numInput.value = Math.round(sv);
    }

    // Slider → number input — preserve appropriate decimal places
    slider.addEventListener('input', () => {
      const sv = parseFloat(slider.value);
      const dec = parseInt(numInput.dataset.decimals || '0');
      if (dec >= 2 || step <= 0.01) {
        numInput.value = sv.toFixed(2);
      } else if (step <= 0.1) {
        numInput.value = sv.toFixed(1);
      } else {
        numInput.value = Math.round(sv);
      }
    });

    // Number input → slider (only on blur/Enter, not on every keystroke)
    const commitNum = () => {
      let raw = (numInput.value + '').replace(',', '.');
      let v = parseFloat(raw);
      if (isNaN(v) || numInput.value === '') return;
      v = Math.max(mn, Math.min(mx, v));
      const dec = parseInt(numInput.dataset.decimals || '0');
      // Format display value
      if (dec >= 2 || step <= 0.01) {
        numInput.value = v.toFixed(2);
      } else if (step <= 0.1) {
        numInput.value = v.toFixed(1);
      } else {
        numInput.value = Math.round(v);
      }
      // Move slider visually WITHOUT triggering its input event
      // (slider step would round the value and overwrite the number input)
      slider.value = v;
      // Dispatch a custom event that update functions listen to instead
      slider.dispatchEvent(new CustomEvent('syncedInput', { detail: { value: v } }));
    };
    numInput.addEventListener('change', commitNum);
    numInput.addEventListener('blur', commitNum);
    numInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { commitNum(); numInput.blur(); }
    });
    // Slider native input → also fire syncedInput so update functions only need one listener
    slider.addEventListener('input', () => {
      slider.dispatchEvent(new CustomEvent('syncedInput', { detail: { value: parseFloat(slider.value) } }));
    });
  });
}

// ============ CHART PERIOD FILTER & ZOOM RESET ============
// Store full data per chart for period slicing
const chartFullData = {};

function storeChartData(chartId, labels, datasets) {
  chartFullData[chartId] = { labels: [...labels], datasets: datasets.map(d=>({...d, data:[...d.data]})) };
}

function applyPeriod(chartId, years) {
  const ch = Chart.getChart($(chartId));
  if (!ch || !chartFullData[chartId]) return;
  const full = chartFullData[chartId];
  if (years === 'all') {
    ch.data.labels = full.labels;
    ch.data.datasets.forEach((d,i) => d.data = full.datasets[i].data);
  } else {
    const maxY = parseInt(years);
    const slice = full.labels.map((l,i)=>i).filter(i => full.labels[i] <= maxY);
    ch.data.labels = slice.map(i=>full.labels[i]);
    ch.data.datasets.forEach((d,i) => d.data = slice.map(j=>full.datasets[i].data[j]));
  }
  ch.resetZoom && ch.resetZoom();
  ch.update();
  // update active button
  const btns = document.querySelectorAll(`.period-btn[data-chart="${chartId}"]`);
  btns.forEach(b => b.classList.toggle('active', b.dataset.years === String(years)));
}

function resetZoom(chartId) {
  const ch = Chart.getChart($(chartId));
  if (ch && ch.resetZoom) ch.resetZoom();
  const wrap = $(chartId)?.closest('.chart-card');
  if (wrap) { const btn = wrap.querySelector('.zoom-reset-btn'); if (btn) btn.classList.remove('visible'); }
}

document.addEventListener('click', e => {
  const btn = e.target.closest('.period-btn');
  if (!btn) return;
  applyPeriod(btn.dataset.chart, btn.dataset.years === 'all' ? 'all' : parseInt(btn.dataset.years));
});

// ============ CHART EXPAND (mobile landscape) ============
let modalChart = null;

function openChartModal(sourceCanvasId, title) {
  const overlay = $('chart-modal');
  const modalCanvas = $('chart-modal-canvas');
  const sourceCanvas = $(sourceCanvasId);
  if (!sourceCanvas) return;

  // Get Chart.js instance from source canvas
  const sourceChart = Chart.getChart(sourceCanvas);
  if (!sourceChart) return;

  $('chart-modal-title').textContent = title;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Destroy previous modal chart
  if (modalChart) { modalChart.destroy(); modalChart = null; }

  // Clone config from source chart
  const cfg = {
    type: sourceChart.config.type,
    data: JSON.parse(JSON.stringify(sourceChart.config.data)),
    options: {
      ...JSON.parse(JSON.stringify(sourceChart.config.options)),
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
    }
  };
  // Boost font sizes for fullscreen
  if (cfg.options.plugins?.legend?.labels) {
    cfg.options.plugins.legend.labels.font = { family: 'DM Sans', size: 13 };
  }
  if (cfg.options.scales?.x?.ticks) cfg.options.scales.x.ticks.font = { family: 'DM Mono', size: 11 };
  if (cfg.options.scales?.y?.ticks) cfg.options.scales.y.ticks.font = { family: 'DM Mono', size: 11 };

  modalChart = new Chart(modalCanvas, cfg);
}

function closeChartModal() {
  $('chart-modal').classList.remove('open');
  document.body.style.overflow = '';
  if (modalChart) { modalChart.destroy(); modalChart = null; }
}

$('chart-modal-close').addEventListener('click', closeChartModal);
$('chart-modal').addEventListener('click', (e) => {
  if (e.target === $('chart-modal')) closeChartModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeChartModal();
});

// Wire up all chart cards
const CHART_META = [
  ['p0a-chart-all', 'Usporedba svih fondova'],
  ['p0a-chart',     'Rast odabranog fonda'],
  ['p0b-chart-platforms', 'Usporedba platformi'],
  ['p0b-chart',     'Rast portfelja'],
  ['p1-chart',      '3. Stup vs PEPP'],
  ['p2-chart',      'Pension vs ETF'],
  ['p3-chart',      'Rast portfelja — Pension + ETF'],
];

CHART_META.forEach(([canvasId, title]) => {
  const canvas = $(canvasId);
  if (!canvas) return;
  const card = canvas.closest('.chart-card');
  if (!card) return;

  card.addEventListener('click', (e) => {
    // Only open on mobile (or if expand btn clicked)
    if (window.innerWidth <= 768 || e.target.closest('.chart-expand-btn')) {
      openChartModal(canvasId, title);
    }
  });
});

// ============ INIT ============
// Ensure DOM is fully ready before init
function initApp() {
  setupSyncPairs();
  // Also restore from localStorage if available
  const STORE_KEYS = Object.keys(localStorage).filter(k => k.startsWith('miv_'));
  if (STORE_KEYS.length > 0) {
    STORE_KEYS.forEach(k => {
      const id = k.replace('miv_', '');
      const el = $(id);
      if (el && el.tagName === 'INPUT' && el.type === 'number') {
        const saved = localStorage.getItem(k);
        const num = parseFloat(saved);
        if (!isNaN(num)) {
          el.value = saved;
          const pair = SLIDER_PAIRS.find(p => p[1] === id);
          if (pair) { const sl = $(pair[0]); if (sl) sl.value = num; }
        }
      }
    });
  }
  [updateP0a, updateP0b, updateP1, updateP2, updateP3].forEach(fn => {
    try { fn(); } catch(e) { console.error('Update error:', fn.name, e); }
  });
}
function safeInitApp() {
  try { initApp(); } catch(e) { 
    console.error('InitApp error:', e);
    // Try individual updates as fallback
    try { updateP0a(); } catch(e2) {}
    try { updateP0b(); } catch(e2) {}
    try { updateP1(); } catch(e2) {}
    try { updateP2(); } catch(e2) {}
    try { updateP3(); } catch(e2) {}
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', safeInitApp);
} else {
  safeInitApp();
}

// Save to localStorage on change
SLIDER_PAIRS.forEach(([,numId]) => {
  const el = $(numId);
  if (el) el.addEventListener('change', () => {
    localStorage.setItem('miv_' + numId, el.value);
  });
});

// ============ FEEDBACK & AI CHAT ============

// Star rating
let selectedRating = 0;
const ratingLabels = ['','😞 Loše','😐 Može biti bolje','🙂 Solidno','😊 Dobro','🤩 Odlično!'];
document.querySelectorAll('.star-btn').forEach(btn => {
  btn.addEventListener('mouseenter', () => {
    const v = +btn.dataset.val;
    document.querySelectorAll('.star-btn').forEach((b,i) => b.classList.toggle('active', i < v));
    $('rating-label').textContent = ratingLabels[v];
  });
  btn.addEventListener('mouseleave', () => {
    document.querySelectorAll('.star-btn').forEach((b,i) => b.classList.toggle('active', i < selectedRating));
    $('rating-label').textContent = selectedRating ? ratingLabels[selectedRating] : 'Klikni za ocjenu';
  });
  btn.addEventListener('click', () => {
    selectedRating = +btn.dataset.val;
    $('rating-label').textContent = '✅ Ocjena ' + selectedRating + '/5 zabilježena — ' + ratingLabels[selectedRating];
    try { localStorage.setItem('miv_rating', selectedRating); } catch(e){}
  });
});

// Feedback type toggle
document.querySelectorAll('.fb-type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.fb-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// Submit feedback
function submitFeedback() {
  const text = $('fb-text').value.trim();
  if (!text) { $('fb-text').style.borderColor = 'var(--red)'; setTimeout(()=>$('fb-text').style.borderColor='',1500); return; }
  const type = document.querySelector('.fb-type-btn.active')?.dataset.type || 'prijedlog';
  const entry = { type, text, rating: selectedRating, ts: new Date().toISOString() };
  try {
    const prev = JSON.parse(localStorage.getItem('miv_feedback') || '[]');
    prev.push(entry);
    localStorage.setItem('miv_feedback', JSON.stringify(prev));
  } catch(e){}
  $('fb-submit-btn').disabled = true;
  $('fb-text').value = '';
  $('feedback-sent').style.display = 'block';
  setTimeout(() => { $('feedback-sent').style.display='none'; $('fb-submit-btn').disabled=false; }, 4000);
}

// ── AI CHAT ──
// ⚠️ POSTAVI SVOJ WORKER URL OVDJE:
const AI_WORKER_URL = 'https://empty-pine-8e64.marin-marsan.workers.dev';

let aiHistory = [];
let aiTyping = false;

function addAiMsg(role, text) {
  const msgs = $('ai-messages');
  const isBot = role === 'bot';
  const div = document.createElement('div');
  div.className = 'ai-msg ' + role;
  let html = text.split('\n').join('<br>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  div.innerHTML = `<div class="ai-msg-avatar">${isBot ? '🤖' : '👤'}</div><div class="ai-msg-bubble">${html}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function showTyping() {
  const msgs = $('ai-messages');
  const div = document.createElement('div');
  div.className = 'ai-msg bot'; div.id = 'ai-typing-indicator';
  div.innerHTML = '<div class="ai-msg-avatar">🤖</div><div class="ai-msg-bubble"><div class="ai-typing"><span></span><span></span><span></span></div></div>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function removeTyping() {
  const el = document.getElementById('ai-typing-indicator');
  if (el) el.remove();
}

async function sendAiMsg() {
  if (aiTyping) return;
  const input = $('ai-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  $('ai-send-btn').disabled = true;
  addAiMsg('user', text);
  aiHistory.push({ role: 'user', content: text });
  aiTyping = true;
  showTyping();

  try {
    const resp = await fetch(AI_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: aiHistory.slice(-10) })
    });
    const data = await resp.json();
    const reply = data.content?.[0]?.text || data.error || 'Došlo je do greške. Pokušaj ponovo.';
    removeTyping();
    addAiMsg('bot', reply);
    aiHistory.push({ role: 'assistant', content: reply });
  } catch(e) {
    removeTyping();
    addAiMsg('bot', '⚠️ Greška pri spajanju na AI. Provjeri internet vezu i pokušaj ponovo.');
  }
  aiTyping = false;
  $('ai-send-btn').disabled = false;
  input.focus();
}

function sendQuickMsg(text) {
  // Open chat if closed
  const chatEl = document.getElementById('ai-chat-float');
  const fabEl = document.getElementById('ai-fab');
  if (!chatEl.classList.contains('open')) {
    chatEl.classList.add('open');
    fabEl.classList.add('open');
  }
  $('ai-input').value = text;
  sendAiMsg();
}

function toggleAiChat() {
  const chatEl = document.getElementById('ai-chat-float');
  const fabEl = document.getElementById('ai-fab');
  chatEl.classList.toggle('open');
  fabEl.classList.toggle('open');
  if (chatEl.classList.contains('open')) {
    setTimeout(() => $('ai-input')?.focus(), 300);
  }
}

// Restore saved rating
try {
  const r = localStorage.getItem('miv_rating');
  if (r) {
    selectedRating = +r;
    document.querySelectorAll('.star-btn').forEach((b,i) => b.classList.toggle('active', i < selectedRating));
    if($('rating-label')) $('rating-label').textContent = ratingLabels[selectedRating] || '';
  }
} catch(e){}

// === POLL SYSTEM ===
const pollState = {
  feature: { votes: {}, selected: [], voted: false },
  priority: { votes: {}, selected: [], voted: false }
};

function togglePollOption(el) {
  if (pollState.feature.voted) return;
  el.classList.toggle('selected');
  const btn = document.getElementById('poll-feature-btn');
  const anySelected = document.querySelectorAll('[data-poll="feature"].selected').length > 0;
  btn.disabled = !anySelected;
}

function selectPollSingle(el) {
  if (pollState.priority.voted) return;
  document.querySelectorAll('[data-poll="priority"]').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('poll-priority-btn').disabled = false;
}

function submitPoll(pollId) {
  if (pollState[pollId].voted) return;
  const selected = document.querySelectorAll(`[data-poll="${pollId}"].selected`);
  if (!selected.length) return;

  let votes = pollState[pollId].votes;
  const allOptions = document.querySelectorAll(`[data-poll="${pollId}"]`);
  allOptions.forEach(o => {
    const v = o.dataset.value;
    if (!votes[v]) votes[v] = 0;
  });
  selected.forEach(o => { votes[o.dataset.value]++; });

  pollState[pollId].votes = votes;
  pollState[pollId].voted = true;

  try {
    const saved = JSON.parse(localStorage.getItem('miv_polls') || '{}');
    saved[pollId] = { votes, ts: new Date().toISOString() };
    localStorage.setItem('miv_polls', JSON.stringify(saved));
  } catch(e){}

  showPollResults(pollId);
}

function showPollResults(pollId) {
  const votes = pollState[pollId].votes;
  const total = Object.values(votes).reduce((s, v) => s + v, 0);
  const options = document.querySelectorAll(`[data-poll="${pollId}"]`);

  options.forEach(o => {
    o.classList.add('voted');
    o.style.cursor = 'default';
    const v = votes[o.dataset.value] || 0;
    const pct = total > 0 ? Math.round((v / total) * 100) : 0;
    o.querySelector('.poll-pct').textContent = pct + '%';
    o.querySelector('.poll-bar-bg').style.width = pct + '%';
    if (v === Math.max(...Object.values(votes)) && v > 0) {
      o.querySelector('.poll-label').style.color = 'var(--etf-l)';
    }
  });

  const btn = document.getElementById(`poll-${pollId}-btn`);
  btn.textContent = '✅ Hvala na glasu!';
  btn.disabled = true;
  document.getElementById(`poll-${pollId}-total`).textContent = `Ukupno glasova: ${total}`;
}

// Init polls from localStorage
(function initPolls() {
  try {
    const saved = JSON.parse(localStorage.getItem('miv_polls') || '{}');
    if (saved.feature) { pollState.feature.votes = saved.feature.votes || {}; pollState.feature.voted = true; showPollResults('feature'); }
    if (saved.priority) { pollState.priority.votes = saved.priority.votes || {}; pollState.priority.voted = true; showPollResults('priority'); }
  } catch(e){}
})();

// === ADMIN PANEL ===
const WORKER_URL = 'https://empty-pine-8e64.marin-marsan.workers.dev';
let adminToken = sessionStorage.getItem('marsanai_admin') || null;
let adminAiOn = true;

function openAdminPanel() {
  document.getElementById('admin-overlay').classList.add('open');
  if (adminToken) {
    showAdminDash();
  } else {
    document.getElementById('admin-login-view').style.display = '';
    document.getElementById('admin-dash-view').style.display = 'none';
  }
}

function closeAdminPanel() {
  document.getElementById('admin-overlay').classList.remove('open');
}

async function adminLogin() {
  const user = document.getElementById('admin-user').value.trim();
  const pass = document.getElementById('admin-pass').value;
  const errEl = document.getElementById('admin-err');
  const btn = document.getElementById('admin-login-btn');
  
  if (!user || !pass) { errEl.textContent = 'Upiši korisničko ime i lozinku'; errEl.style.display = 'block'; return; }
  
  btn.disabled = true;
  btn.textContent = 'Provjera...';
  errEl.style.display = 'none';

  try {
    const resp = await fetch(WORKER_URL + '/admin/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass })
    });
    const data = await resp.json();
    
    if (data.success) {
      adminToken = data.token;
      sessionStorage.setItem('marsanai_admin', adminToken);
      showAdminDash();
    } else {
      errEl.textContent = '❌ Pogrešno korisničko ime ili lozinka';
      errEl.style.display = 'block';
    }
  } catch(e) {
    errEl.textContent = '⚠️ Greška pri spajanju';
    errEl.style.display = 'block';
  }
  
  btn.disabled = false;
  btn.textContent = 'Prijavi se';
}

async function showAdminDash() {
  document.getElementById('admin-login-view').style.display = 'none';
  document.getElementById('admin-dash-view').style.display = '';
  
  try {
    const resp = await fetch(WORKER_URL + '/admin/api/status', {
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    const data = await resp.json();
    if (data.error === 'unauthorized') { adminLogout(); return; }
    adminAiOn = data.ai_enabled;
    updateAdminUI();
  } catch(e) {}
}

function updateAdminUI() {
  const statusEl = document.getElementById('admin-status');
  const toggleBtn = document.getElementById('admin-toggle-btn');
  
  statusEl.className = 'admin-status ' + (adminAiOn ? 'on' : 'off');
  statusEl.innerHTML = 'AI Bot je trenutno: <strong>' + (adminAiOn ? '✅ UKLJUČEN' : '⛔ ISKLJUČEN') + '</strong>';
  
  toggleBtn.className = 'admin-toggle ' + (adminAiOn ? 'turn-off' : 'turn-on');
  toggleBtn.textContent = adminAiOn ? '⏸️ Isključi AI bota' : '▶️ Uključi AI bota';
}

async function adminToggle() {
  const newState = adminAiOn ? 'off' : 'on';
  try {
    const resp = await fetch(WORKER_URL + '/admin/api/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken },
      body: JSON.stringify({ action: newState })
    });
    const data = await resp.json();
    if (data.error === 'unauthorized') { adminLogout(); return; }
    adminAiOn = data.ai_enabled;
    updateAdminUI();
  } catch(e) {}
}

function adminLogout() {
  adminToken = null;
  sessionStorage.removeItem('marsanai_admin');
  document.getElementById('admin-login-view').style.display = '';
  document.getElementById('admin-dash-view').style.display = 'none';
  document.getElementById('admin-user').value = '';
  document.getElementById('admin-pass').value = '';
}

