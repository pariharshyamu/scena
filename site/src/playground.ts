import { EXAMPLES, findExample } from './examples';

const select = document.getElementById('example-select') as HTMLSelectElement;
const editor = document.getElementById('editor') as HTMLTextAreaElement;
const preview = document.getElementById('preview') as HTMLIFrameElement;
const errorBar = document.getElementById('error') as HTMLDivElement;
const runButton = document.getElementById('run') as HTMLButtonElement;
const resetButton = document.getElementById('reset') as HTMLButtonElement;

// Populate the example picker, grouped.
const groups = new Map<string, HTMLOptGroupElement>();
for (const example of EXAMPLES) {
  let group = groups.get(example.group);
  if (!group) {
    group = document.createElement('optgroup');
    group.label = example.group;
    groups.set(example.group, group);
    select.appendChild(group);
  }
  const option = document.createElement('option');
  option.value = example.id;
  option.textContent = example.title;
  group.appendChild(option);
}

const initial = findExample(new URLSearchParams(location.search).get('example') ?? 'seek');
select.value = initial.id;
editor.value = initial.code;

let pendingCode: string | null = null;

function run(): void {
  errorBar.style.display = 'none';
  pendingCode = editor.value;
  // Fresh iframe per run: no stale games, loops or listeners to clean up.
  preview.src = `runner.html?t=${Date.now()}`;
}

window.addEventListener('message', (event) => {
  const data = event.data;
  if (data?.type === 'runner-ready' && pendingCode !== null) {
    preview.contentWindow?.postMessage({ type: 'run', code: pendingCode }, '*');
  } else if (data?.type === 'runner-error') {
    errorBar.textContent = data.message;
    errorBar.style.display = 'block';
  }
});

select.addEventListener('change', () => {
  const example = findExample(select.value);
  editor.value = example.code;
  const url = new URL(location.href);
  url.searchParams.set('example', example.id);
  history.replaceState(null, '', url);
  run();
});

runButton.addEventListener('click', run);
resetButton.addEventListener('click', () => {
  editor.value = findExample(select.value).code;
  run();
});

editor.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    run();
  } else if (e.key === 'Tab') {
    e.preventDefault();
    const { selectionStart, selectionEnd, value } = editor;
    editor.value = value.slice(0, selectionStart) + '  ' + value.slice(selectionEnd);
    editor.selectionStart = editor.selectionEnd = selectionStart + 2;
  }
});

run();
