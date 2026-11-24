'use strict';
const status = document.getElementById('status');
const events = document.getElementById('events');
function record(item) {
  const line = document.createElement('div');
  line.className = 'event';
  const time = document.createElement('time');
  time.textContent = item.timestamp || '';
  const detail = document.createElement('span');
  detail.textContent = item.text || '';
  line.append(time, detail);
  events.prepend(line);
  while (events.children.length > 45) events.lastElementChild.remove();
}
window.walledguard.onStatus(text => {
  status.textContent = text;
  const paused = text.startsWith('DLP PAUSED');
  document.body.classList.toggle('signin-mode', paused);
  for (const id of ['chatgpt','perplexity','restart','colors']) document.getElementById(id).disabled = paused;
  document.getElementById('signin').hidden = paused;
  document.getElementById('resume').hidden = !paused;
});
window.walledguard.onLog(record);
window.walledguard.history().then(items => items.forEach(record));
document.getElementById('chatgpt').addEventListener('click', () => window.walledguard.open('chatgpt'));
document.getElementById('perplexity').addEventListener('click', () => window.walledguard.open('perplexity'));
document.getElementById('restart').addEventListener('click', () => window.walledguard.restart());

document.getElementById('signin').addEventListener('click', () => window.walledguard.signin());
document.getElementById('resume').addEventListener('click', () => window.walledguard.resume());
document.getElementById('colors').addEventListener('click', async () => {
  const result = await window.walledguard.refreshColors();
  record({ timestamp: new Date().toLocaleTimeString(), text: `Response styling: ${result.blocks} matched blocks in ${result.tabs} monitored tabs` });
});
