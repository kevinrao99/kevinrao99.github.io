/* global jsyaml */
(() => {
  // Add new source files here; IDs and ref fields determine their tree positions.
  const files = [
    'main.yaml',
    'Trees/Roots.yaml',
    'Trees/Roots-term/Animalia.yaml',
    'Trees/Roots-term/Animalia-term/Protostomia.yaml',
    'Trees/Roots-term/Animalia-term/Deuterostomia.yaml',
    'Trees/Roots-term/Animalia-term/Deutero-term/Teleostei.yaml',
    'Trees/Roots-term/Animalia-term/Deutero-term/Synapsids.yaml',
    'Trees/Roots-term/Animalia-term/Deutero-term/Synapsids-term/Carnivora.yaml',
    'Trees/Roots-term/Animalia-term/Deutero-term/Synapsids-term/Cetartiodactyla.yaml',
    'Trees/Roots-term/Animalia-term/Deutero-term/Sauropsids.yaml',
    'Trees/Roots-term/Animalia-term/Deutero-term/Sauropsids-term/Dinosauria.yaml'
  ];

  async function loadFile(file) {
    const url = `tree_of_life/${file}`;
    const section = document.createElement('section');
    const heading = document.createElement('h3');
    const link = document.createElement('a');
    link.href = url;
    link.textContent = url;
    heading.append(link);
    const status = document.createElement('p');
    status.className = 'status';
    status.textContent = 'Loading…';
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    pre.append(code);
    section.append(heading, status, pre);
    document.getElementById('files').append(section);

    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      const text = await response.text();
      code.textContent = text;
      if (text.length === 0) status.textContent = 'Empty file.';
      else status.remove();
      return { file, text };
    } catch (error) {
      status.textContent = `Could not load this file: ${error.message}`;
      pre.remove();
      return { file, error };
    }
  }

  // Render the source's two highlight forms, treating all other content as text.
  function appendNotes(container, text) {
    const paragraph = document.createElement('p');
    paragraph.className = 'note-text';
    const stack = [paragraph];
    const tags = /<mark(?: class="highlight-green")?>|<\/mark>/g;
    let offset = 0;
    for (const match of text.matchAll(tags)) {
      stack[stack.length - 1].append(text.slice(offset, match.index));
      if (match[0] === '</mark>') {
        if (stack.length > 1) stack.pop();
        else stack[0].append(match[0]);
      } else {
        const mark = document.createElement('mark');
        if (match[0].includes('highlight-green')) mark.className = 'highlight-green';
        stack[stack.length - 1].append(mark);
        stack.push(mark);
      }
      offset = match.index + match[0].length;
    }
    stack[stack.length - 1].append(text.slice(offset));
    container.append(paragraph);
  }

  function renderTree(documents) {
    const index = new Map();
    const references = new Set();
    const roots = [];
    const nodes = [];

    function register(node, file, ancestors = new Set()) {
      if (!node || typeof node !== 'object' || Array.isArray(node)) {
        throw new Error(`${file}: every tree node must be a mapping.`);
      }
      if (ancestors.has(node)) throw new Error(`${file}: circular YAML branch.`);
      for (const field of ['id', 'ref', 'name', 'notes']) {
        if (node[field] !== undefined && typeof node[field] !== 'string') {
          throw new Error(`${file}: ${field} must be text.`);
        }
      }
      if (node.children !== undefined && !Array.isArray(node.children)) {
        throw new Error(`${file}: children must be a list.`);
      }
      if (node.id) {
        if (index.has(node.id)) throw new Error(`${file}: duplicate ID ${node.id}.`);
        index.set(node.id, node);
      }
      if (node.ref) references.add(node.ref);
      nodes.push(node);
      const path = new Set(ancestors).add(node);
      for (const child of node.children || []) register(child, file, path);
    }

    for (const { file, text } of documents) {
      if (!file.startsWith('Trees/')) continue;
      const root = jsyaml.load(text, { filename: file, schema: jsyaml.JSON_SCHEMA });
      if (root === undefined || root === null) continue;
      register(root, file);
      roots.push(root);
    }

    // Check edges before rendering so a bad reference cannot recurse forever.
    const checked = new Set();
    function checkBranches(node, path = new Set()) {
      if (path.has(node)) throw new Error(`Circular branch at ${node.name || node.id || node.ref || 'an unnamed node'}.`);
      if (checked.has(node)) return;
      const next = new Set(path).add(node);
      if (node.ref && index.has(node.ref)) checkBranches(index.get(node.ref), next);
      for (const child of node.children || []) checkBranches(child, next);
      checked.add(node);
    }
    for (const node of nodes) checkBranches(node);

    function resolve(node) {
      const parts = [node];
      let current = node;
      while (current.ref && index.has(current.ref)) {
        current = index.get(current.ref);
        parts.push(current);
      }
      return {
        name: parts.find(part => part.name !== undefined)?.name || '',
        // Repeated notes on a ref and its target are shown once; distinct notes remain.
        notes: [...new Set(parts.map(part => part.notes).filter(Boolean))],
        children: parts.flatMap(part => part.children || []),
        missing: Boolean(current.ref && !index.has(current.ref))
      };
    }

    let serial = 0;
    function renderNode(source) {
      const node = resolve(source);
      const item = document.createElement('li');
      item.className = 'tree-node';
      if (!node.name) item.setAttribute('aria-label', 'Unnamed branch');
      const row = document.createElement('div');
      row.className = 'node-row';
      const name = document.createElement('span');
      name.className = 'node-name';
      name.textContent = node.name;
      row.append(name);
      const notes = document.createElement('div');
      notes.className = 'node-notes';
      const children = document.createElement('ul');
      children.className = 'tree-list tree-children';
      const key = ++serial;
      notes.id = `notes-${key}`;
      children.id = `children-${key}`;
      notes.hidden = children.hidden = true;

      function addToggle(label, panel, enabled, populate, initiallyOpen = false) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'node-toggle';
        button.disabled = !enabled;
        button.setAttribute('aria-controls', panel.id);
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.classList.add('toggle-icon');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('aria-hidden', 'true');
        icon.setAttribute('focusable', 'false');
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', `tree_of_life/icons/toggles.svg#${label}`);
        icon.append(use);
        button.append(icon);
        const accessibleName = node.name || 'unnamed branch';
        const displayLabel = label === 'children' ? 'subclades' : label;
        const emptyLabel = label === 'children' ? 'Subclades not explored yet' : 'No notes';
        let populated = false;

        function setOpen(open) {
          if (open && !populated) {
            populate();
            populated = true;
          }
          panel.hidden = !open;
          const verb = open ? 'Hide' : 'Show';
          button.title = enabled ? `${verb} ${displayLabel}` : emptyLabel;
          button.setAttribute('aria-label', `${button.title} for ${accessibleName}`);
          button.setAttribute('aria-expanded', String(open));
          button.setAttribute('aria-pressed', String(open));
        }

        setOpen(enabled && initiallyOpen);
        button.addEventListener('click', () => setOpen(panel.hidden));
        row.append(button);
      }

      addToggle('notes', notes, node.notes.length > 0, () => {
        for (const text of node.notes) appendNotes(notes, text);
      }, true);
      addToggle('children', children, node.children.length > 0 || node.missing, () => {
        for (const child of node.children) children.append(renderNode(child));
        if (node.missing) {
          const status = document.createElement('li');
          status.className = 'status branch-status';
          status.textContent = 'No continuation is available yet.';
          children.append(status);
        }
      });
      item.append(row, notes, children);
      return item;
    }

    const forest = roots.filter(root => !references.has(root.id));
    if (!forest.length) throw new Error('No tree roots are available.');
    document.getElementById('tree').replaceChildren(...forest.map(renderNode));
  }

  async function start() {
    const documents = await Promise.all(files.map(loadFile));
    const status = document.getElementById('tree-status');
    try {
      const failed = documents.find(document => document.error);
      if (failed) throw failed.error;
      if (typeof jsyaml === 'undefined') throw new Error('The YAML parser could not be loaded.');
      renderTree(documents);
      status.hidden = true;
    } catch (error) {
      status.textContent = `Could not display the tree: ${error.message}`;
    }
  }

  start();
})();
