var $ = id => document.getElementById(id);
const fmt = n => new Intl.NumberFormat('hr-HR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n);

// DOMPurify helper za tbody fragmente — wrappa u <table> kontekst da se <tr>/<td> ne stripaju
function sanitizeTbody(html) {
  const table = document.createElement('table');
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  tbody.innerHTML = html;
  DOMPurify.sanitize(table, { IN_PLACE: true, ALLOWED_TAGS: ['table','tbody','tr','td'], ALLOWED_ATTR: ['style'] });
  return tbody.innerHTML;
}
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

  // DMF: dohvati prinos iz odabranog fonda
  const selectedFundName = $('p1-dmf-select') ? $('p1-dmf-select').value : 'Erste Plavi Expert';
  const fund = DMF_FUNDS.find(f => f.name === selectedFundName) || DMF_FUNDS[1];
  const dmfR = fund.r10y; // koristimo 10-godišnji prosjek

  // PEPP: fiksni prinos (Finax ~8% bruto - 1% naknada)
  const peppR = PEPP_RATE;

  const pot = calcPoticaj(uplata, 'p1-poticaj-toggle');
  updatePoticajInfo(uplata, 'p1-poticaj-toggle', 'p1-poticaj-lbl', 'p1-poticaj-info');

  // Ažuriraj info o prinosima
  if ($('p1-dmf-rate-note')) {
    $('p1-dmf-rate-note').textContent = `Prosječni prinos (10g): ${dmfR.toFixed(2)}% | 5g: ${fund.r5y.toFixed(2)}% | HANFA 2024: ${fund.r2024.toFixed(2)}%`;
  }
  if ($('p1-pepp-net')) {
    $('p1-pepp-net').textContent = `${peppR.toFixed(1)}%`;
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
  $('p1-desc').innerHTML = DOMPurify.sanitize(`<strong style="color:${winnerColor}">${winner}</strong> završava s više novca — ${((diff/Math.min(peppFinal,dmfFinal))*100).toFixed(1)}% razlika.${potTxt}`, { ALLOWED_TAGS: ['strong'], ALLOWED_ATTR: ['style'] });

  const milestones = [5,10,15,20,25,30,35,40,50,60].filter(y=>y<=god);
  if(!milestones.includes(god)) milestones.push(god);
  $('p1-tbody').innerHTML = sanitizeTbody(milestones.map(y=>{
    const d=compoundFV(uplata+pot,dmfR,y);
    const p=compoundFV(uplata,peppR,y);
    const dif=p-d;
    return `<tr><td>${y}. god</td><td style="color:var(--dmf-l)">${fmt(d)}</td><td style="color:var(--pepp-l)">${fmt(p)}</td><td style="color:${dif>0?'var(--etf-l)':'var(--dmf-l)'}">${dif>0?'+':''}${fmt(dif)}</td></tr>`;
  }).join(''));

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
  storeChartData('p1-chart', labels, ds);
  if(!chart1){ chart1=makeChart('p1-chart',labels,ds); }
  else { chart1.data.labels=labels; chart1.data.datasets.forEach((d,i)=>{ d.data=ds[i].data; }); chart1.update(); }
}
['p1-uplata','p1-god'].forEach(id => $(id).addEventListener('syncedInput', updateP1));
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
    $('p2-desc').innerHTML=DOMPurify.sanitize(`<strong style="color:${cols[wk]}">${names[wk]}</strong> vodi za <strong>${fmt(wv-lv)}</strong> ispred <strong style="color:${cols[lk]}">${names[lk]}</strong>. To je ${((wv/lv-1)*100).toFixed(1)}% razlike.`, { ALLOWED_TAGS: ['strong'], ALLOWED_ATTR: ['style'] });
  }

  const milestones=[5,10,15,20,25,30,35,40].filter(y=>y<=god);
  if(!milestones.includes(god)) milestones.push(god);
  $('p2-tbody').innerHTML=sanitizeTbody(milestones.map(y=>{
    const d=compoundFV(uplata+calcPoticaj(uplata,'p2-poticaj-toggle'),dmfR,y);
    const p=compoundFV(uplata,peppR,y);
    const e=compoundFV(uplata,etfR,y);
    return `<tr><td>${y}.</td>
      <td style="color:var(--dmf-l);opacity:${p2vis.dmf?1:0.3}">${fmt(d)}</td>
      <td style="color:var(--pepp-l);opacity:${p2vis.pepp?1:0.3}">${fmt(p)}</td>
      <td style="color:var(--etf-l);opacity:${p2vis.etf?1:0.3}">${fmt(e)}</td></tr>`;
  }).join(''));

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
  storeChartData('p2-chart', labels, ds);
  if(!chart2){ chart2=makeChart('p2-chart',labels,ds); }
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
  $('p3-tbody').innerHTML=sanitizeTbody(milestones.map(y=>{
    const pv=compoundFV(penUplata+penBonus,penR,y);
    const ev=compoundFV(etfUplata,etfR,y);
    const cv=pv+ev; const rf=Math.pow(1+inf/100,y);
    return `<tr><td>${y}.</td>
      <td style="color:${penColor}">${fmt(pv)}</td>
      <td style="color:var(--etf-l)">${fmt(ev)}</td>
      <td style="color:var(--combo-l)">${fmt(cv)}</td>
      <td style="color:var(--muted2)">${fmt(cv/rf)}</td></tr>`;
  }).join(''));

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
  storeChartData('p3-chart', labels, ds);
  if(!chart3){ chart3=makeChart('p3-chart',labels,ds); }
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
        zoom: {}
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
  {name:'Croatia 1000A',      r2024:11.5,  r5y:5.35, r10y:5.60, rAll:5.77, risk:'VISOK',   color:'#4ae8a0'},
  {name:'Erste Plavi Expert', r2024:10.44, r5y:6.62, r10y:5.95, rAll:5.30, risk:'VISOK',   color:'#4a9fe8'},
  {name:'AZ Profit',          r2024:8.89,  r5y:4.51, r10y:4.80, rAll:5.10, risk:'UMJEREN', color:'#e8a44a'},
  {name:'Croatia DMF',        r2024:7.72,  r5y:4.12, r10y:3.90, rAll:3.67, risk:'UMJEREN', color:'#f5c87a'},
  {name:'AZ Benefit',         r2024:4.14,  r5y:3.20, r10y:3.10, rAll:3.00, risk:'NIZAK',   color:'#7abff5'},
  {name:'Raiffeisen DMF',     r2024:3.36,  r5y:3.00, r10y:2.90, rAll:2.80, risk:'NIZAK',   color:'#8890b0'},
  {name:'Erste Plavi Protect',r2024:3.32,  r5y:2.80, r10y:2.70, rAll:2.60, risk:'NIZAK',   color:'#6b7394'},
  {name:'Croatia 1000C',      r2024:3.13,  r5y:2.50, r10y:2.50, rAll:2.50, risk:'NIZAK',   color:'#5a6180'},
];
const PEPP_RATE = 7.0; // Finax historijski ~8% bruto - 1% naknada = ~7% neto
const PEPP_RATE_GROSS = 8.0;

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
  $('p0a-info').innerHTML = DOMPurify.sanitize(`Korišten <strong>5-godišnji prosjek</strong> fonda (${r5y}%). Prinos 2024: <strong>${r2024}%</strong>. ${usePoticaj?`Godišnji poticaj: <strong>${fmt(poticajGod)}</strong>.`:''}`, { ALLOWED_TAGS: ['strong'], ALLOWED_ATTR: [] });
  $('p0a-tbody').innerHTML = sanitizeTbody(tbody.join(''));

  // Chart single fund
  // Spremi full podatke za period filter (1Y,3Y,5Y,...,SVE)
  storeChartData('p0a-chart', labels, [
    {label:fundName,data:vals,borderColor:'#e8a44a',backgroundColor:'rgba(232,164,74,0.08)',fill:true,borderWidth:2.5,pointRadius:0,tension:0.4}
  ]);
  if(!chartP0a){
    chartP0a=makeChart('p0a-chart',labels,[{label:fundName,data:vals,borderColor:'#e8a44a',backgroundColor:'rgba(232,164,74,0.08)',fill:true,borderWidth:2.5,pointRadius:0,tension:0.4}]);
  } else {
    chartP0a.data.labels=labels;
    chartP0a.data.datasets[0].data=vals;
    chartP0a.data.datasets[0].label=fundName;
    chartP0a.update();
  }

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
  // Spremi full podatke za period filter (1Y,3Y,5Y,...,SVE)
  storeChartData('p0a-chart-all', allLabels, allDS);
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
  $('p0b-tbody').innerHTML=sanitizeTbody(mils.map(y=>{
    const a=arr[y-1];
    let b=initial; for(let i=0;i<y;i++) b=(b+uplata)*(1+etf.rate/100);
    const inp2=initial+uplata*y;
    const g2=a.val-inp2;
    return `<tr><td>${y}.</td><td style="color:var(--muted2)">${fmt(inp2)}</td><td style="color:var(--etf-l)">${fmt(Math.round(b))}</td><td style="color:var(--pepp-l)">${fmt(a.val)}</td><td style="color:var(--red)">${fmt(a.fees)}</td><td style="color:var(--etf-l)">${fmt(inp2+g2*(1-taxRate))}</td></tr>`;
  }).join(''));

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
  storeChartData('p0b-chart', labels, ds);
  if(!chartP0b){ chartP0b=makeChart('p0b-chart',labels,ds); }
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
  // Spremi full podatke za period filter i za usporedbu platformi
  storeChartData('p0b-chart-platforms', plLabels, plDS);
  if(!chartP0bPlatforms){
    chartP0bPlatforms=makeChart('p0b-chart-platforms',plLabels,plDS);
  } else {
    chartP0bPlatforms.data.labels=plLabels;
    chartP0bPlatforms.data.datasets.forEach((d,i)=>{
      d.data=plDS[i].data;
      d.label=plDS[i].label;
      d.borderWidth=plDS[i].borderWidth;
    });
    chartP0bPlatforms.update();
  }
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
    ch.data.labels = [...full.labels];
    ch.data.datasets.forEach((d,i) => d.data = [...full.datasets[i].data]);
  } else {
    const maxY = parseInt(years);
    // Uzmi prvih maxY točaka (podaci su godišnji, 1Y = 1 točka je premalo za graf)
    // Minimum 2 točke da se linija vidi
    const count = Math.max(2, Math.min(maxY, full.labels.length));
    ch.data.labels = full.labels.slice(0, count);
    ch.data.datasets.forEach((d,i) => d.data = full.datasets[i].data.slice(0, count));
  }
  ch.update();
  // update active button
  const btns = document.querySelectorAll(`.period-btn[data-chart="${chartId}"]`);
  btns.forEach(b => b.classList.toggle('active', b.dataset.years === String(years)));
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
  btn.addEventListener('click', async () => {
    const newRating = +btn.dataset.val;
    const prevRating = parseInt(localStorage.getItem('miv_rating')) || 0;

    // Privremeno pokaži "šaljem..." stanje
    const labelEl = $('rating-label');
    const originalLabel = labelEl ? labelEl.textContent : '';
    if (labelEl) labelEl.textContent = '⏳ Bilježim ocjenu...';
    document.querySelectorAll('.star-btn').forEach(b => b.style.pointerEvents = 'none');

    try {
      const resp = await fetch(AI_WORKER_URL + '/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'rating', rating: newRating, prevRating })
      });
      const data = await resp.json();

      if (!resp.ok) {
        // Server odbio (npr. već ocjenjivao)
        if (labelEl) labelEl.textContent = data.alreadyVoted
          ? '⛔ Već si dao ocjenu danas — pokušaj sutra!'
          : '⚠️ Greška pri slanju — pokušaj ponovo.';
        document.querySelectorAll('.star-btn').forEach(b => b.style.pointerEvents = '');
        return;
      }

      // ── Server potvrdio — ažuriraj UI ──
      selectedRating = newRating;
      document.querySelectorAll('.star-btn').forEach((b, i) => {
        b.classList.toggle('active', i < selectedRating);
        b.style.pointerEvents = '';
      });
      if (labelEl) labelEl.textContent = '✅ Ocjena ' + selectedRating + '/5 zabilježena — ' + ratingLabels[selectedRating];
      try { localStorage.setItem('miv_rating', selectedRating); } catch(e){}
      loadRatingStats();

    } catch(e) {
      if (labelEl) labelEl.textContent = '⚠️ Greška mreže — pokušaj ponovo.';
      document.querySelectorAll('.star-btn').forEach(b => b.style.pointerEvents = '');
    }
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
async function submitFeedback() {
  const text = $('fb-text').value.trim();
  if (!text) { $('fb-text').style.borderColor = 'var(--red)'; setTimeout(()=>$('fb-text').style.borderColor='',1500); return; }
  const type = document.querySelector('.fb-type-btn.active')?.dataset.type || 'prijedlog';
  const email = $('fb-email') ? $('fb-email').value.trim() : '';
  const entry = { type, text, rating: selectedRating, email, ts: new Date().toISOString() };
  
  $('fb-submit-btn').disabled = true;
  
  try {
    await fetch(AI_WORKER_URL + '/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    });
  } catch(e) { console.error('Feedback send error:', e); }
  
  $('fb-text').value = '';
  if ($('fb-email')) $('fb-email').value = '';
  $('feedback-sent').style.display = 'block';
  $('feedback-sent').textContent = email ? '✅ Hvala! Odgovor ćemo poslati na tvoj email.' : '✅ Hvala! Tvoj feedback je zabilježen.';
  setTimeout(() => { $('feedback-sent').style.display='none'; $('fb-submit-btn').disabled=false; }, 4000);
}

// ── AI CHAT ──
// ⚠️ POSTAVI SVOJ WORKER URL OVDJE:
const AI_WORKER_URL = 'https://empty-pine-8e64.marin-marsan.workers.dev';

let aiHistory = [];
let aiTyping = false;
let aiBotEnabled = true; // ažurira se iz /status

// FAQ fallback kad je AI isključen — pitanja i predefinirani odgovori (bez poziva Workeru)
const AI_FAQ = [
  { q: 'Što je PEPP?', a: 'PEPP (Pan-European Personal Pension Product) je europska osobna mirovina dostupna u cijeloj EU. Omogućuje ulaganje u ETF portfelje s mirovinskim beneficijama i poreznim olakšicama. U Hrvatskoj ga nudi npr. Finax — pogledaj tab "PEPP" u aplikaciji.' },
  { q: 'ETF ili DMF?', a: 'Ovisi o cilju i riziku. DMF donosi državni poticaj (15% do 99,54€/god) i manji rizik. ETF obično daje veći dugoročni prinos i veću fleksibilnost. Za većinu je dobra kombinacija: dio u DMF (poticaj), dio u ETF — vidi "Pension + ETF" kalkulator.' },
  { q: 'Kako početi s 50€?', a: 'S 50€ mjesečno možeš početi s DMF-om (50€/mj = 600€/god, država doplaćuje 90€) ili s ETF platformom (Trading 212, Finax). Otvori "Hrvatski DMF" ili "ETF Platforme" u navigaciji i unesi iznose — kalkulator pokazuje projekciju.' },
  { q: 'Što je državni poticaj?', a: 'Država doplaćuje 15% tvoje godišnje uplate na 3. mirovinski stup, najviše 99,54€/god (ako uplatiš najmanje 663,61€ godišnje). To je besplatan novac — iskoristi ga. U kalkulatoru uključi opciju "Poticaj" da vidiš utjecaj.' },
  { q: 'IBKR ili Trading 212?', a: 'IBKR: niže naknade, više za iskusnije. Trading 212: jednostavniji, 0€ naknade za kupnju dionica/ETF-ova. Oboje osigurano do 20.000€. Usporedi sve platforme u tabu "ETF Platforme" — naknade i projekcija su uračunati.' },
  { q: 'Kako koristiti kalkulator?', a: 'Odaberi tab (Hrvatski DMF, PEPP, ETF Platforme ili usporedbe), unesi mjesečnu/godišnju uplatu i broj godina. Graf i tablica pokazuju projekciju. Kviz "Koji put?" preporučuje strategiju na temelju tvojih odgovora.' },
];

function sanitizeText(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function addAiMsg(role, text) {
  const msgs = $('ai-messages');
  const isBot = role === 'bot';
  const div = document.createElement('div');
  div.className = 'ai-msg ' + role;

  // Avatar (statički tekst — bez korisničkog unosa, sigurno)
  const avatar = document.createElement('div');
  avatar.className = 'ai-msg-avatar';
  avatar.textContent = isBot ? '🤖' : '👤';

  // Bubble
  const bubble = document.createElement('div');
  bubble.className = 'ai-msg-bubble';

  if (isBot) {
    // AI odgovor može sadržavati markdown (**bold**, \n→<br>).
    // Koristimo DOMPurify kako bismo dozvolili samo sigurne tagove.
    let html = sanitizeText(text)
      .split('\n').join('<br>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    bubble.innerHTML = DOMPurify.sanitize(html, { ALLOWED_TAGS: ['strong','em','br'], ALLOWED_ATTR: [] });
  } else {
    // Korisnički unos: NIKAD HTML — samo čisti tekst
    bubble.textContent = text;
  }

  div.appendChild(avatar);
  div.appendChild(bubble);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function showTyping() {
  const msgs = $('ai-messages');
  const div = document.createElement('div');
  div.className = 'ai-msg bot'; div.id = 'ai-typing-indicator';
  // Statički sadržaj — gradimo DOM-om umjesto innerHTML
  const avatar = document.createElement('div');
  avatar.className = 'ai-msg-avatar';
  avatar.textContent = '🤖';
  const bubble = document.createElement('div');
  bubble.className = 'ai-msg-bubble';
  const typing = document.createElement('div');
  typing.className = 'ai-typing';
  for (let i = 0; i < 3; i++) typing.appendChild(document.createElement('span'));
  bubble.appendChild(typing);
  div.appendChild(avatar);
  div.appendChild(bubble);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function removeTyping() {
  const el = document.getElementById('ai-typing-indicator');
  if (el) el.remove();
}

async function sendAiMsg() {
  if (aiTyping) return;
  if (!aiBotEnabled) {
    addAiMsg('bot', 'AI asistent je privremeno isključen. Odaberi jedno od čestih pitanja ispod.');
    return;
  }
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

// Dohvati status AI bota s Workera; ažurira aiBotEnabled i UI (FAQ vs input)
async function checkAiStatus() {
  try {
    const resp = await fetch(AI_WORKER_URL + '/status');
    const data = await resp.json();
    aiBotEnabled = data.ai_enabled === true;
  } catch (e) {
    aiBotEnabled = false;
  }
  updateChatUI();
}

// Prikaži FAQ sučelje kad je AI isključen, inače normalan input
function updateChatUI() {
  const faqWrap = document.getElementById('ai-faq-wrap');
  const inputRow = document.querySelector('.ai-input-row');
  const quickBtns = document.querySelector('.ai-quick-btns');
  if (!faqWrap || !inputRow) return;
  if (aiBotEnabled) {
    faqWrap.style.display = 'none';
    inputRow.style.display = '';
    if (quickBtns) quickBtns.style.display = '';
  } else {
    faqWrap.style.display = 'block';
    inputRow.style.display = 'none';
    if (quickBtns) quickBtns.style.display = 'none';
    renderFaqButtons();
  }
}

function renderFaqButtons() {
  const wrap = document.getElementById('ai-faq-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  AI_FAQ.forEach((faq) => {
    const btn = document.createElement('button');
    btn.className = 'ai-faq-btn';
    btn.textContent = faq.q;
    btn.onclick = () => showFaqReply(faq.q, faq.a);
    wrap.appendChild(btn);
  });
}

// Ispiši pitanje i predefinirani odgovor u chat (bez poziva Workeru)
function showFaqReply(question, answer) {
  addAiMsg('user', question);
  addAiMsg('bot', answer);
}

function toggleAiChat() {
  const chatEl = document.getElementById('ai-chat-float');
  const fabEl = document.getElementById('ai-fab');
  chatEl.classList.toggle('open');
  fabEl.classList.toggle('open');
  if (chatEl.classList.contains('open')) {
    checkAiStatus().then(() => {
      setTimeout(() => (aiBotEnabled ? $('ai-input')?.focus() : null), 300);
    });
  }
}

// Dohvati statistiku ocjena sa servera
async function loadRatingStats() {
  const el = document.getElementById('rating-stats');
  if (!el) return;
  try {
    const resp = await fetch(AI_WORKER_URL + '/rating-stats');
    const data = await resp.json();
    if (data.count && data.count > 0) {
      const avg = data.avg.toFixed(1);
      const fullStars = Math.round(data.avg);
      const starsHtml = '★'.repeat(fullStars) + '☆'.repeat(5 - fullStars);
      el.innerHTML = DOMPurify.sanitize(`
        <span class="rs-avg">${avg}</span>
        <span class="rs-stars">${starsHtml}</span>
        <span class="rs-count">${data.count} ${data.count === 1 ? 'ocjena' : data.count < 5 ? 'ocjene' : 'ocjena'}</span>
      `, { ALLOWED_TAGS: ['span'], ALLOWED_ATTR: ['class'] });
    }
  } catch(e) {}
}
loadRatingStats();

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
  feature: { votes: {}, selected: [], voted: false, prevSelected: [] },
  priority: { votes: {}, selected: [], voted: false, prevSelected: [] }
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

function changePollVote(pollId) {
  const state = pollState[pollId];
  state.voted = false;
  const options = document.querySelectorAll(`[data-poll="${pollId}"]`);
  options.forEach(o => {
    o.classList.remove('voted');
    o.style.cursor = '';
    // Označi prethodno odabrane
    if (state.prevSelected.includes(o.dataset.value)) o.classList.add('selected');
    else o.classList.remove('selected');
    o.querySelector('.poll-pct').textContent = '';
    o.querySelector('.poll-bar-bg').style.width = '0%';
    o.querySelector('.poll-label').style.color = '';
  });
  const btn = document.getElementById(`poll-${pollId}-btn`);
  btn.textContent = pollId === 'feature' ? 'Glasaj 🗳️' : 'Odaberi prioritet 🗳️';
  btn.disabled = state.prevSelected.length === 0;
  // Sakrij "Promijeni glas" gumb
  const changeBtn = document.getElementById(`poll-${pollId}-change`);
  if (changeBtn) changeBtn.style.display = 'none';
  document.getElementById(`poll-${pollId}-total`).textContent = '';
}

async function submitPoll(pollId) {
  if (pollState[pollId].voted) return;
  const selected = document.querySelectorAll(`[data-poll="${pollId}"].selected`);
  if (!selected.length) return;

  // Onemogući gumb dok čekamo odgovor servera
  const btn = document.getElementById(`poll-${pollId}-btn`);
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Šaljem...';

  const state = pollState[pollId];
  let votes = { ...state.votes };
  const allOptions = document.querySelectorAll(`[data-poll="${pollId}"]`);
  allOptions.forEach(o => { if (!votes[o.dataset.value]) votes[o.dataset.value] = 0; });

  // Pripremi novi glas
  state.prevSelected.forEach(v => { if (votes[v] > 0) votes[v]--; });
  const newSelected = [];
  selected.forEach(o => { votes[o.dataset.value]++; newSelected.push(o.dataset.value); });

  // ── Pošalji na server (zaštićeni /api/vote endpoint) ──
  try {
    const resp = await fetch(AI_WORKER_URL + '/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'poll', pollId, votes })
    });
    const data = await resp.json();

    if (!resp.ok) {
      // Server je odbio glas (npr. već glasao)
      btn.textContent = data.alreadyVoted ? '⛔ Već si glasao danas' : '⚠️ Greška — pokušaj ponovo';
      btn.disabled = data.alreadyVoted; // zadrži disabled samo ako je duplikat
      if (!data.alreadyVoted) setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 3000);
      return;
    }

    // ── Server potvrdio — sad ažuriraj UI i lokalno stanje ──
    state.votes = votes;
    state.voted = true;
    state.prevSelected = newSelected;

    try {
      const saved = JSON.parse(localStorage.getItem('miv_polls') || '{}');
      saved[pollId] = { votes, prevSelected: newSelected, ts: new Date().toISOString() };
      localStorage.setItem('miv_polls', JSON.stringify(saved));
    } catch(e){}

    showPollResults(pollId);

  } catch(e) {
    console.error('Poll send error:', e);
    btn.textContent = '⚠️ Greška mreže — pokušaj ponovo';
    btn.disabled = false;
    setTimeout(() => { btn.textContent = originalText; }, 3000);
  }
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
    if (v === Math.max(...Object.values(votes)) && v > 0)
      o.querySelector('.poll-label').style.color = 'var(--etf-l)';
  });

  const btn = document.getElementById(`poll-${pollId}-btn`);
  btn.textContent = '✅ Hvala na glasu!';
  btn.disabled = true;
  document.getElementById(`poll-${pollId}-total`).textContent = `Ukupno glasova: ${total}`;

  // Prikaži "Promijeni glas" gumb
  let changeBtn = document.getElementById(`poll-${pollId}-change`);
  if (!changeBtn) {
    changeBtn = document.createElement('button');
    changeBtn.id = `poll-${pollId}-change`;
    changeBtn.className = 'poll-change-btn';
    changeBtn.textContent = '✏️ Promijeni glas';
    changeBtn.onclick = () => changePollVote(pollId);
    btn.parentNode.insertBefore(changeBtn, btn.nextSibling);
  }
  changeBtn.style.display = 'inline-block';
}

// Init polls from localStorage
(function initPolls() {
  try {
    const saved = JSON.parse(localStorage.getItem('miv_polls') || '{}');
    if (saved.feature) {
      pollState.feature.votes = saved.feature.votes || {};
      pollState.feature.voted = true;
      pollState.feature.prevSelected = saved.feature.prevSelected || [];
      showPollResults('feature');
    }
    if (saved.priority) {
      pollState.priority.votes = saved.priority.votes || {};
      pollState.priority.voted = true;
      pollState.priority.prevSelected = saved.priority.prevSelected || [];
      showPollResults('priority');
    }
  } catch(e){}
})();

// === AI FAB SAKRIJ (mobitel) ===
let fabHidden = false;
function hideFabToggle() {
  const fab = document.getElementById('ai-fab');
  const hideBtn = document.getElementById('ai-fab-hide');
  fabHidden = !fabHidden;
  if (fabHidden) {
    fab.style.display = 'none';
    hideBtn.textContent = '🤖 prikaži AI';
    hideBtn.style.bottom = '1rem';
  } else {
    fab.style.display = '';
    hideBtn.textContent = '👁️ sakrij AI';
    hideBtn.style.bottom = '5rem';
  }
}

// === HOME ONBOARDING QUIZ ===
const hqAnswers = {};

function startHomeQuiz() {
  document.getElementById('home-quiz-wrap').style.display = 'block';
  document.getElementById('home-quiz-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function skipHomeQuiz() {
  document.getElementById('home-quiz-wrap').style.display = 'none';
  document.querySelector('[data-page=p0a]').click();
}

function hqSelect(el) {
  const q = el.dataset.hq;
  document.querySelectorAll(`[data-hq="${q}"]`).forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  hqAnswers[q] = el.dataset.val;
  const btn = document.getElementById(`hqn-${q}`);
  if (btn) { btn.disabled = false; }
}

function hqNext(step) {
  if (!hqAnswers[step]) return;
  document.getElementById(`hq-${step}`).style.display = 'none';
  document.getElementById(`hqs-${step}`).classList.remove('active');
  document.getElementById(`hqs-${step}`).classList.add('done');
  const next = step + 1;
  if (next <= 4) {
    document.getElementById(`hq-${next}`).style.display = 'block';
    document.getElementById(`hqs-${next}`).classList.add('active');
  }
}

function hqBack(step) {
  document.getElementById(`hq-${step}`).style.display = 'none';
  document.getElementById(`hqs-${step - 1}`).classList.remove('done');
  document.getElementById(`hqs-${step - 1}`).classList.add('active');
  document.getElementById(`hq-${step - 1}`).style.display = 'block';
}

function hqShowResult() {
  document.getElementById('hq-4').style.display = 'none';
  document.getElementById('hqs-4').classList.remove('active');
  document.getElementById('hqs-4').classList.add('done');
  document.getElementById('hq-progress').style.display = 'none';

  const a = hqAnswers;
  let emoji, title, sub, btns;

  // Logika preporuke
  if (a[2] === 'low' || a[0] === 'senior') {
    // Niskorizičan / stariji → DMF
    emoji = '🏦';
    title = 'Hrvatski DMF (3. mirovinski stup)';
    sub = 'Za tebe je idealan državno reguliran mirovinski fond s poreznim olakšicama. Sigurniji prinos, državni poticaj do 99€ godišnje.';
    btns = [
      { label: '▶ Usporedi DMF fondove', page: 'p0a', cls: 'primary' },
      { label: 'DMF vs PEPP', page: 'p1', cls: 'secondary' },
    ];
  } else if (a[3] === 'growth' || (a[2] === 'high' && a[0] === 'young')) {
    // Rast / visok rizik / mlad → ETF
    emoji = '🚀';
    title = 'ETF fondovi';
    sub = 'Za tebe su idealni globalni ETF fondovi (VWCE, IWDA). Maksimalni dugoročni prinos, niske naknade, bez ograničenja isplate.';
    btns = [
      { label: '▶ Usporedi ETF platforme', page: 'p0b', cls: 'primary' },
      { label: 'DMF/PEPP vs ETF', page: 'p2', cls: 'secondary' },
    ];
  } else if (a[3] === 'both' || a[1] === 'mid') {
    // Kombinirano
    emoji = '⚖️';
    title = 'Kombinirana strategija';
    sub = 'Idealno: 66€/mj u DMF za državni poticaj + ostatak u ETF. Dobivaš i sigurnost mirovinskog i rast ETF-a.';
    btns = [
      { label: '▶ Pension + ETF strategija', page: 'p3', cls: 'primary' },
      { label: 'DMF/PEPP vs ETF', page: 'p2', cls: 'secondary' },
      { label: 'Usporedi sve', page: 'p1', cls: 'secondary' },
    ];
  } else {
    // Default → PEPP
    emoji = '🌍';
    title = 'PEPP (Europska mirovina)';
    sub = 'Finax PEPP je odlična alternativa domaćem DMF-u — europski reguliran, diversificirani ETF portfelj s niskim naknadama.';
    btns = [
      { label: '▶ DMF vs PEPP usporedba', page: 'p1', cls: 'primary' },
      { label: 'Pension + ETF', page: 'p3', cls: 'secondary' },
    ];
  }

  document.getElementById('hqr-emoji').textContent = emoji;
  document.getElementById('hqr-title').textContent = title;
  document.getElementById('hqr-sub').textContent = sub;
  document.getElementById('hqr-btns').innerHTML = DOMPurify.sanitize(btns.map(b =>
    `<button class="hq-result-btn ${b.cls}" onclick="document.querySelector('[data-page=${b.page}]').click()">${b.label}</button>`
  ).join(''), { ALLOWED_TAGS: ['button'], ALLOWED_ATTR: ['class','onclick'] });

  document.getElementById('hq-result').style.display = 'block';
}

function hqRestart() {
  Object.keys(hqAnswers).forEach(k => delete hqAnswers[k]);
  for (let i = 0; i <= 4; i++) {
    const card = document.getElementById(`hq-${i}`);
    const step = document.getElementById(`hqs-${i}`);
    if (card) { card.style.display = i === 0 ? 'block' : 'none'; }
    if (step) { step.classList.remove('done', 'active'); if (i === 0) step.classList.add('active'); }
    document.querySelectorAll(`[data-hq="${i}"]`).forEach(o => o.classList.remove('selected'));
    const btn = document.getElementById(`hqn-${i}`);
    if (btn) btn.disabled = true;
  }
  document.getElementById('hq-result').style.display = 'none';
  document.getElementById('hq-progress').style.display = 'flex';
}

// Otvori admin panel ako URL ima #admin hash
if (window.location.hash === '#admin') {
  window.addEventListener('load', () => { setTimeout(openAdminPanel, 500); });
}

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
  statusEl.innerHTML = DOMPurify.sanitize('AI Bot je trenutno: <strong>' + (adminAiOn ? '✅ UKLJUČEN' : '⛔ ISKLJUČEN') + '</strong>', { ALLOWED_TAGS: ['strong'], ALLOWED_ATTR: [] });
  
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

function switchAdminTab(tab) {
  ['ai','fb','mgmt'].forEach(t => {
    const tabBtn = document.getElementById('admin-tab-' + t);
    const tabContent = document.getElementById('admin-tab-content-' + t);
    if (tabBtn) tabBtn.classList.toggle('active', t === tab);
    if (tabContent) tabContent.classList.toggle('active', t === tab);
  });
  if (tab === 'fb') { loadFeedbackLog(); loadPollResults(); }
  if (tab === 'mgmt') { loadKvItems(); }
}

async function loadFeedbackLog() {
  const logEl = document.getElementById('admin-feedback-log');
  if (!adminToken || !logEl) return;
  logEl.textContent = 'Učitavanje...';
  try {
    const resp = await fetch(WORKER_URL + '/admin/api/feedback', {
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    if (!resp.ok) {
      logEl.textContent = '⚠️ Greška pri dohvaćanju.';
      logEl.className = 'fb-log-empty';
      return;
    }
    const data = await resp.json();
    const items = data.items || [];
    if (!items.length) {
      logEl.textContent = 'Nema feedback unosa.';
      logEl.className = 'fb-log-empty';
      return;
    }
    const typeIcon = { prijedlog:'💡', pohvala:'👏', greška:'🐛', pitanje:'❓' };
    logEl.innerHTML = '';

    // Renderaj DOM imperativno kako bismo koristili textContent za user podatke
    items.slice().reverse().forEach((it, idx) => {
      const realIdx = items.length - 1 - idx;
      const d = new Date(it.ts);
      const ts = d.toLocaleDateString('hr-HR') + ' ' + d.toLocaleTimeString('hr-HR', {hour:'2-digit',minute:'2-digit'});
      const ratingStars = it.rating && it.rating > 0 ? '⭐'.repeat(Math.min(5, it.rating)) : '';

      const itemDiv = document.createElement('div');
      itemDiv.className = 'fb-log-item';
      itemDiv.id = 'fb-item-' + realIdx;

      const metaDiv = document.createElement('div');
      metaDiv.className = 'fb-log-meta';

      const typeSpan = document.createElement('span');
      const safeType = ['prijedlog','pohvala','greška','pitanje'].includes(it.type) ? it.type : 'drugo';
      typeSpan.className = 'fb-log-type ' + safeType;
      typeSpan.textContent = (typeIcon[safeType] || '') + ' ' + safeType;

      const tsSpan = document.createElement('span');
      tsSpan.className = 'fb-log-ts';
      tsSpan.textContent = ts;

      metaDiv.appendChild(typeSpan);
      metaDiv.appendChild(tsSpan);

      if (it.email) {
        const statusSpan = document.createElement('span');
        statusSpan.className = 'fb-log-status ' + (it.reply ? 'odgovoreno' : 'novo');
        statusSpan.textContent = it.reply ? '✅ odgovoreno' : '🔵 čeka odgovor';
        metaDiv.appendChild(statusSpan);
      }

      itemDiv.appendChild(metaDiv);

      if (it.email) {
        const emailDiv = document.createElement('div');
        emailDiv.className = 'fb-log-email';
        emailDiv.textContent = '📧 ' + it.email;
        itemDiv.appendChild(emailDiv);
      }

      const textDiv = document.createElement('div');
      textDiv.className = 'fb-log-text';
      textDiv.textContent = it.text || '';
      itemDiv.appendChild(textDiv);

      if (ratingStars) {
        const ratingDiv = document.createElement('div');
        ratingDiv.className = 'fb-log-rating';
        ratingDiv.textContent = ratingStars;
        itemDiv.appendChild(ratingDiv);
      }

      if (it.reply) {
        const replyDiv = document.createElement('div');
        replyDiv.className = 'fb-log-reply';
        replyDiv.textContent = '💬 Odgovor: ' + it.reply;
        itemDiv.appendChild(replyDiv);
      } else if (it.email) {
        const replyRow = document.createElement('div');
        replyRow.className = 'fb-reply-row';

        const input = document.createElement('input');
        input.className = 'fb-reply-input';
        input.id = 'reply-input-' + realIdx;
        input.placeholder = 'Upiši odgovor korisniku...';

        const btn = document.createElement('button');
        btn.className = 'fb-reply-btn';
        btn.id = 'reply-btn-' + realIdx;
        btn.textContent = '📨 Pošalji';
        btn.onclick = () => sendReply(realIdx);

        replyRow.appendChild(input);
        replyRow.appendChild(btn);
        itemDiv.appendChild(replyRow);
      }

      logEl.appendChild(itemDiv);
    });
  } catch(e) {
    logEl.textContent = '⚠️ Greška pri dohvaćanju.';
    logEl.className = 'fb-log-empty';
  }
}

async function sendReply(idx) {
  const input = $(`reply-input-${idx}`);
  const btn = $(`reply-btn-${idx}`);
  if (!input || !btn) return;
  const replyText = input.value.trim();
  if (!replyText) { input.style.borderColor = 'var(--red)'; setTimeout(()=>input.style.borderColor='',1500); return; }

  btn.disabled = true;
  btn.textContent = 'Šaljem...';

  try {
    const resp = await fetch(WORKER_URL + '/admin/api/feedback/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken },
      body: JSON.stringify({ idx, reply: replyText })
    });
    const data = await resp.json();
    if (data.ok) {
      const item = $(`fb-item-${idx}`);
      if (item) {
        const replyRow = item.querySelector('.fb-reply-row');
        if (replyRow) {
          const replyDiv = document.createElement('div');
          replyDiv.className = 'fb-log-reply';
          replyDiv.textContent = '💬 Odgovor: ' + replyText;
          replyRow.replaceWith(replyDiv);
        }
        const badge = item.querySelector('.fb-log-status');
        if (badge) { badge.className = 'fb-log-status odgovoreno'; badge.textContent = '✅ odgovoreno'; }
      }
    } else {
      btn.disabled = false;
      btn.textContent = '📨 Pošalji';
      alert('Greška pri slanju: ' + (data.error || 'nepoznata'));
    }
  } catch(e) {
    btn.disabled = false;
    btn.textContent = '📨 Pošalji';
    console.error('Reply error:', e);
  }
}

async function loadPollResults() {
  const el = document.getElementById('admin-poll-results');
  if (!adminToken || !el) return;
  el.innerHTML = 'Učitavanje...';
  try {
    const resp = await fetch(WORKER_URL + '/admin/api/polls', {
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    if (!resp.ok) { el.innerHTML = '⚠️ Greška pri dohvaćanju.'; return; }
    const data = await resp.json();
    const polls = data.polls || {};
    const pollLabels = {
      feature: { title: '💡 Nova funkcionalnost', options: { dijete: '👶 Kalkulator za dijete', inflacija: '📉 Usporedba inflacije', export: '🖨️ Export izvještaja' } },
      priority: { title: '🎯 Prioritet razvoja', options: { bugovi: '🐛 Popraviti bugove', ai: '🤖 AI asistent', nova: '✨ Nova funkcionalnost' } }
    };
    let html = '', hasAny = false;
    for (const [pollId, meta] of Object.entries(pollLabels)) {
      const votes = polls[pollId] || {};
      const total = Object.values(votes).reduce((s, v) => s + v, 0);
      if (total === 0) continue;
      hasAny = true;
      html += `<div style="margin-bottom:0.75rem;background:var(--surface3);border-radius:8px;padding:0.6rem 0.75rem;">`;
      html += `<div style="font-weight:700;color:var(--text);margin-bottom:0.4rem;font-size:0.76rem;">${meta.title} <span style="color:var(--muted);font-weight:400;">(${total} glasova)</span></div>`;
      const sorted = Object.entries(meta.options).sort((a,b) => (votes[b[0]]||0)-(votes[a[0]]||0));
      for (const [val, label] of sorted) {
        const cnt = votes[val] || 0;
        const pct = total > 0 ? Math.round((cnt/total)*100) : 0;
        const isTop = cnt === Math.max(...Object.values(votes)) && cnt > 0;
        html += `<div style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.25rem;">`;
        html += `<div style="flex:1;font-size:0.72rem;color:${isTop?'var(--etf-l)':'var(--muted2)'}">${label}</div>`;
        html += `<div style="width:80px;height:5px;background:var(--surface2);border-radius:999px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:${isTop?'var(--etf)':'var(--pepp)'};border-radius:999px;"></div></div>`;
        html += `<div style="font-size:0.7rem;color:var(--muted2);min-width:28px;text-align:right;">${pct}%</div>`;
        html += `</div>`;
      }
      html += `</div>`;
    }
    el.innerHTML = hasAny ? DOMPurify.sanitize(html, { ALLOWED_TAGS: ['div','span'], ALLOWED_ATTR: ['style'] }) : '<div style="text-align:center;padding:0.75rem 0;color:var(--muted);">Još nema glasova.</div>';
  } catch(e) {
    el.innerHTML = '⚠️ Greška.';
  }
}


// ========== ADMIN UPRAVLJANJE TAB ==========

async function adminResetPolls() {
  if (!confirm('Jesi li siguran? Ovo će TRAJNO obrisati sve podatke anketa!')) return;
  const btn = document.getElementById('admin-reset-polls-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Brisanje...'; }
  try {
    const resp = await fetch(WORKER_URL + '/admin/api/reset-polls', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    const data = await resp.json();
    if (data.ok) {
      showMgmtMsg('✅ Ankete su obrisane (' + (data.deleted || 0) + ' ključeva).', 'success');
      loadKvItems();
    } else {
      showMgmtMsg('❌ Greška: ' + (data.error || 'nepoznata'), 'error');
    }
  } catch(e) {
    showMgmtMsg('❌ Mrežna greška.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🗑️ Resetiraj ankete'; }
  }
}

async function adminClearFeedback() {
  if (!confirm('Jesi li siguran? Ovo će TRAJNO obrisati SV feedback poruke!')) return;
  const btn = document.getElementById('admin-clear-fb-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Brisanje...'; }
  try {
    const resp = await fetch(WORKER_URL + '/admin/api/clear-feedback', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    const data = await resp.json();
    if (data.ok) {
      showMgmtMsg('✅ Sav feedback je obrisan.', 'success');
      loadKvItems();
    } else {
      showMgmtMsg('❌ Greška: ' + (data.error || 'nepoznata'), 'error');
    }
  } catch(e) {
    showMgmtMsg('❌ Mrežna greška.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🧹 Obriši sav feedback'; }
  }
}

async function adminDeleteItem(key, namespace) {
  if (!confirm('Jesi li siguran? Brišem ključ: "' + key + '" (' + namespace + ')')) return;
  try {
    const resp = await fetch(WORKER_URL + '/admin/api/delete-item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken },
      body: JSON.stringify({ key, namespace })
    });
    const data = await resp.json();
    if (data.ok) {
      showMgmtMsg('✅ Stavka "' + key + '" obrisana.', 'success');
      loadKvItems();
    } else {
      showMgmtMsg('❌ Greška: ' + (data.error || 'nepoznata'), 'error');
    }
  } catch(e) {
    showMgmtMsg('❌ Mrežna greška.', 'error');
  }
}

async function loadKvItems() {
  const listEl = document.getElementById('admin-kv-list');
  if (!adminToken || !listEl) return;
  listEl.innerHTML = '<div style="color:var(--muted2);font-size:0.78rem;text-align:center;padding:1rem 0;">Učitavanje...</div>';
  try {
    const resp = await fetch(WORKER_URL + '/admin/api/list-items', {
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    if (!resp.ok) {
      if (resp.status === 401) { adminLogout(); return; }
      listEl.innerHTML = '<div style="color:#f56060;font-size:0.78rem;text-align:center;padding:1rem 0;">⚠️ Greška pri dohvaćanju.</div>';
      return;
    }
    const data = await resp.json();
    const items = data.items || [];

    // Filtriraj interne ključeve (sesije, brute-force, rate-limit, vote lock)
    const filtered = items.filter(it =>
      !it.key.startsWith('session:') &&
      !it.key.startsWith('bf:') &&
      !it.key.startsWith('rl:') &&
      !it.key.startsWith('vote_lock:')
    );

    if (!filtered.length) {
      listEl.innerHTML = '<div style="color:var(--muted2);font-size:0.78rem;text-align:center;padding:1rem 0;">Nema stavki u KV storageu.</div>';
      return;
    }

    const nsColor = { config: '#4a9fe8', ankete: '#e8a44a' };
    listEl.innerHTML = DOMPurify.sanitize(filtered.map(it => {
      const safeKey = it.key.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g, "\\'");
      const displayKey = it.key.replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const color = nsColor[it.namespace] || '#9aa2c0';
      return `<div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.6rem;background:rgba(255,255,255,0.03);border:1px solid #2e3850;border-radius:7px;margin-bottom:0.3rem;">
        <span style="font-size:0.68rem;color:${color};min-width:50px;font-weight:700;">[${it.namespace}]</span>
        <span style="flex:1;font-size:0.75rem;color:#c5cfe9;font-family:monospace;word-break:break-all;">${displayKey}</span>
        <button onclick="adminDeleteItem('${safeKey}','${it.namespace}')"
          style="background:rgba(245,96,96,0.12);border:1px solid rgba(245,96,96,0.3);color:#f56060;border-radius:6px;padding:0.18rem 0.5rem;font-size:0.7rem;cursor:pointer;white-space:nowrap;flex-shrink:0;">
          🗑️ Obriši
        </button>
      </div>`;
    }).join(''), { ALLOWED_TAGS: ['div','span','button'], ALLOWED_ATTR: ['style','onclick'] });

    if (filtered.length < items.length) {
      { const hintDiv = document.createElement('div'); hintDiv.style.cssText = 'color:#5a6180;font-size:0.68rem;margin-top:0.3rem;text-align:center;'; hintDiv.textContent = `(${items.length - filtered.length} internih ključeva skriveno)`; listEl.appendChild(hintDiv); }
    }
  } catch(e) {
    { const errDiv = document.createElement('div'); errDiv.style.cssText = 'color:#f56060;font-size:0.78rem;text-align:center;padding:0.5rem 0;'; errDiv.textContent = '⚠️ Greška: ' + e.message; listEl.replaceChildren(errDiv); }
  }
}

function showMgmtMsg(text, type) {
  const el = document.getElementById('admin-mgmt-msg');
  if (!el) return;
  el.textContent = text;
  el.style.color = type === 'success' ? '#4ae8a0' : '#f56060';
  el.style.display = 'block';
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => { el.style.display = 'none'; }, 4500);
}

// ========== QUIZ LOGIC ==========
const quizAnswers = {};

function quizSelectOption(el) {
  const q = el.dataset.q;
  const val = el.dataset.val;
  // deselect others in same question
  document.querySelectorAll(`.quiz-option[data-q="${q}"]`).forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  quizAnswers[q] = val;
  // enable next button
  const nextBtn = document.getElementById(`qnext-${q}`);
  if (nextBtn) nextBtn.classList.add('ready');
}

function quizNext(currentQ) {
  if (!quizAnswers[currentQ]) return;
  document.getElementById(`qq-${currentQ}`).style.display = 'none';
  document.getElementById(`qstep-${currentQ}`).classList.remove('active');
  document.getElementById(`qstep-${currentQ}`).classList.add('done');
  const nextQ = currentQ + 1;
  if (nextQ <= 4) {
    const nextCard = document.getElementById(`qq-${nextQ}`);
    nextCard.style.display = '';
    nextCard.style.animation = 'none';
    void nextCard.offsetWidth;
    nextCard.style.animation = '';
    document.getElementById(`qstep-${nextQ}`).classList.add('active');
  }
}

function quizBack(currentQ) {
  document.getElementById(`qq-${currentQ}`).style.display = 'none';
  document.getElementById(`qstep-${currentQ}`).classList.remove('active');
  const prevQ = currentQ - 1;
  document.getElementById(`qq-${prevQ}`).style.display = '';
  document.getElementById(`qstep-${prevQ}`).classList.remove('done');
  document.getElementById(`qstep-${prevQ}`).classList.add('active');
}

function quizShowResult() {
  if (!quizAnswers[4]) return;
  // Mark last step done
  document.getElementById(`qq-4`).style.display = 'none';
  document.getElementById(`qstep-4`).classList.remove('active');
  document.getElementById(`qstep-4`).classList.add('done');
  document.getElementById('quizProgress').style.display = 'none';

  const age = quizAnswers[0];
  const amount = quizAnswers[1];
  const risk = quizAnswers[2];
  const goal = quizAnswers[3];
  const exp = quizAnswers[4];

  // Scoring logic
  // Duljina horizonta: mladi = 20+ god, srednji = 10-20, senior = <10
  const longHorizon = age === 'young';
  const midHorizon  = age === 'mid';

  let score = { dmf: 0, pepp: 0, etf: 0, combo: 0 };

  // Age / horizont
  // PEPP > DMF na dug horizont jer nema cap-a na prinos
  if (age === 'young') { score.etf += 3; score.pepp += 3; score.combo += 2; }
  if (age === 'mid')   { score.combo += 3; score.pepp += 2; score.dmf += 2; }
  if (age === 'senior'){ score.dmf += 4; score.pepp += 1; }

  // Amount
  if (amount === 'low')  { score.etf += 3; score.pepp += 1; }
  if (amount === 'mid')  { score.combo += 3; score.dmf += 2; score.pepp += 2; }
  if (amount === 'high') { score.combo += 3; score.etf += 2; score.pepp += 1; }

  // Risk
  if (risk === 'low')  { score.dmf += 3; score.pepp += 1; }
  if (risk === 'mid')  { score.combo += 2; score.pepp += 2; score.dmf += 1; }
  if (risk === 'high') { score.etf += 3; score.combo += 2; score.pepp += 1; }

  // Goal
  if (goal === 'pension') { score.dmf += 3; score.pepp += 2; }
  if (goal === 'growth')  { score.etf += 3; score.pepp += 1; }
  if (goal === 'both')    { score.combo += 4; score.pepp += 1; }

  // Experience
  if (exp === 'none')   { score.dmf += 2; score.pepp += 1; }
  if (exp === 'some')   { score.combo += 2; score.etf += 1; score.pepp += 1; }
  if (exp === 'expert') { score.etf += 2; score.combo += 2; }

  // Dugoročni bonus za PEPP: mlad + rast/oba cilja = PEPP dobiva ekstra bod
  // (reflektira matematičku prednost PEPP-a na 10+ god zbog višeg prinosa)
  if (longHorizon && (goal === 'growth' || goal === 'both')) { score.pepp += 2; }
  if (midHorizon  && (goal === 'growth' || goal === 'both')) { score.pepp += 1; }

  const sorted = Object.entries(score).sort((a,b) => b[1]-a[1]);
  const top = sorted[0][0];
  const second = sorted[1][0];

  const strategies = {
    dmf: {
      emoji: '🏛️', title: 'Hrvatski DMF (3. stup)',
      subtitle: 'Temeljena na sigurnosti i državnom poticaju — idealno za konzervativne ulagače koji žele mirovinski standard.',
      icon: '🏛️', label: 'PRIMARNA PREPORUKA', color: 'var(--dmf)',
      desc: 'Dobrovoljni mirovinski fond s državnim poticajem od 15% (do 99.54€/god). Najprikladniji za one koji cijene sigurnost i porezne benefite.',
      pros: ['Državni poticaj 15% (do 99.54€/god)', 'Neoporeziva uplata poslodavca do 804€/god', 'Regulirano, nadzor HANFA-e', 'Niske naknade (0.4–0.8%/god)'],
      page: 'p0a', cta: 'Otvori DMF kalkulator'
    },
    pepp: {
      emoji: '🌍', title: 'PEPP — Pan-europska mirovina',
      subtitle: 'Europski mirovinski račun s pristupom globalnim ETF tržištima — dobra alternativa domaćem fondu.',
      icon: '🌍', label: 'PRIMARNA PREPORUKA', color: 'var(--pepp)',
      desc: 'Finaxov PEPP omogućava investiranje u ETF portfelje uz mirovinski okvir. Naknada 1% godišnje uz veću fleksibilnost od domaćeg DMF-a.',
      pros: ['Investicija u globalne ETF-ove', 'Dostupno u svim EU zemljama', 'Portfelji 100% dionice do 60/40', 'Veća dugoročna povratnost od DMF-a'],
      page: 'p1', cta: 'Usporedi s DMF-om'
    },
    etf: {
      emoji: '📈', title: 'ETF fondovi (IBKR / T212)',
      subtitle: 'Maksimalni rast kroz globalno diverzificirane ETF-ove — za ulagače koji razumiju tržišta i gledaju dugoročno.',
      icon: '📈', label: 'PRIMARNA PREPORUKA', color: 'var(--etf)',
      desc: 'VWCE, IWDA ili S&P 500 ETF kroz IBKR ili Trading 212. Nema ograničenja isplate, najniže naknade, prinos slobodan od poreza ≥2 god u HR.',
      pros: ['Najniže naknade (0.07–0.22%/god)', 'Prinos bez poreza ≥2 god u HR', 'Osiguranje do 20.000€', 'Potpuna likvidnost'],
      page: 'p0b', cta: 'Usporedi ETF platforme'
    },
    combo: {
      emoji: '🧩', title: 'Kombinirani pristup',
      subtitle: 'Iskoristi državni poticaj za DMF + slobodni rast ETF-ova — optimalna strategija za većinu ulagača.',
      icon: '🧩', label: 'PRIMARNA PREPORUKA', color: 'var(--combo)',
      desc: 'Stavi ~66€/mj u DMF za poticaj (max korist), ostatak u ETF. Tako kombiniraš sigurnost i prinos. Employer bonus do 804€/god na vrh.',
      pros: ['66€/mj u DMF → 99€/god poticaja (besplatan prinos)', 'ETF za slobodni rast bez ograničenja', 'Diverzifikacija rizika', 'Optimizacija poreznih benefita'],
      page: 'p3', cta: 'Otvori kombinirani kalkulator'
    }
  };

  const primary = strategies[top];
  const secondary = strategies[second];

  document.getElementById('qr-emoji').textContent = primary.emoji;
  document.getElementById('qr-title').textContent = primary.title;
  document.getElementById('qr-subtitle').textContent = primary.subtitle;

  let cardsHtml = `
    <div class="quiz-result-card primary">
      <div class="qrc-head">
        <span class="qrc-icon">${primary.icon}</span>
        <div>
          <div class="qrc-label" style="color:${primary.color}">${primary.label}</div>
          <div class="qrc-title">${primary.title}</div>
        </div>
      </div>
      <div class="qrc-desc">${primary.desc}</div>
      <ul class="qrc-pros">${primary.pros.map(p=>`<li>${p}</li>`).join('')}</ul>
      <button class="qrc-cta" onclick="document.querySelector('[data-page=${primary.page}]').click()">${primary.cta}</button>
    </div>
    <div class="quiz-result-card">
      <div class="qrc-head">
        <span class="qrc-icon">${secondary.icon}</span>
        <div>
          <div class="qrc-label">TAKOĐER RAZMOTRI</div>
          <div class="qrc-title">${secondary.title}</div>
        </div>
      </div>
      <div class="qrc-desc">${secondary.desc}</div>
      <ul class="qrc-pros">${secondary.pros.map(p=>`<li>${p}</li>`).join('')}</ul>
      <button class="qrc-cta" onclick="document.querySelector('[data-page=${secondary.page}]').click()">${secondary.cta}</button>
    </div>
  `;
  document.getElementById('qr-cards').innerHTML = DOMPurify.sanitize(cardsHtml, {
    ALLOWED_TAGS: ['div','ul','li','button','span','strong'],
    ALLOWED_ATTR: ['class','style','onclick']
  });

  const result = document.getElementById('quizResult');
  result.classList.add('show');
}

function quizRestart() {
  // Reset all
  Object.keys(quizAnswers).forEach(k => delete quizAnswers[k]);
  for (let i = 0; i <= 4; i++) {
    const card = document.getElementById(`qq-${i}`);
    if (card) card.style.display = i === 0 ? '' : 'none';
    const step = document.getElementById(`qstep-${i}`);
    if (step) {
      step.classList.remove('done','active');
      if (i === 0) step.classList.add('active');
    }
    document.querySelectorAll(`.quiz-option[data-q="${i}"]`).forEach(o => o.classList.remove('selected'));
    const btn = document.getElementById(`qnext-${i}`);
    if (btn) btn.classList.remove('ready');
  }
  document.getElementById('quizProgress').style.display = '';
  document.getElementById('quizResult').classList.remove('show');
}

// Attach click listeners to quiz options (run on DOM ready)
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.quiz-option').forEach(opt => {
    opt.addEventListener('click', () => quizSelectOption(opt));
  });

  // Admin tab buttons
  const tabAi = document.getElementById('admin-tab-ai');
  const tabFb = document.getElementById('admin-tab-fb');
  const tabMgmt = document.getElementById('admin-tab-mgmt');
  if (tabAi) tabAi.addEventListener('click', () => switchAdminTab('ai'));
  if (tabFb) tabFb.addEventListener('click', () => switchAdminTab('fb'));
  if (tabMgmt) tabMgmt.addEventListener('click', () => switchAdminTab('mgmt'));
});
