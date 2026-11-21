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
    const sourceFiles = new Map();
    const fileRoots = new Map();

    function register(node, file, ancestors = new Set()) {
      if (!node || typeof node !== 'object' || Array.isArray(node)) {
        throw new Error(`${file}: every tree node must be a mapping.`);
      }
      if (ancestors.has(node)) throw new Error(`${file}: circular YAML branch.`);
      for (const field of ['id', 'ref', 'name', 'short_description', 'notes']) {
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
      sourceFiles.set(node, file);
      const path = new Set(ancestors).add(node);
      for (const child of node.children || []) register(child, file, path);
    }

    for (const { file, text } of documents) {
      if (!file.startsWith('Trees/')) continue;
      const root = jsyaml.load(text, { filename: file, schema: jsyaml.JSON_SCHEMA });
      if (root === undefined || root === null) continue;
      register(root, file);
      roots.push(root);
      fileRoots.set(file, root);
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
        extinct: parts.some(part => part.extinct === true),
        // Blank descriptions on refs inherit the first nonempty target description.
        shortDescription: parts.find(part => part.short_description?.trim())?.short_description || '',
        // Repeated notes on a ref and its target are shown once; distinct notes remain.
        notes: [...new Set(parts.map(part => part.notes).filter(Boolean))],
        children: parts.flatMap(part => part.children || []),
        missing: Boolean(current.ref && !index.has(current.ref))
      };
    }

    let serial = 0;
    function renderNode(source, initiallyExpanded = false) {
      const node = resolve(source);
      const target = index.get(source.ref);
      const continuationFile = target && sourceFiles.get(target) !== sourceFiles.get(source)
        ? sourceFiles.get(target) : null;
      const item = document.createElement('li');
      item.className = 'tree-node';
      if (!node.name) item.setAttribute('aria-label', 'Unnamed branch');
      const row = document.createElement('div');
      row.className = 'node-row';
      const name = document.createElement('span');
      name.className = 'node-name';
      name.textContent = node.name;
      if (node.extinct) {
        const marker = document.createElement('span');
        marker.className = 'node-extinct';
        marker.textContent = '†';
        marker.title = 'Extinct';
        marker.setAttribute('role', 'img');
        marker.setAttribute('aria-label', 'Extinct');
        name.append('\u00a0', marker);
      }
      row.append(name);
      const notes = document.createElement('div');
      notes.className = 'node-notes';
      const children = document.createElement('ul');
      children.className = 'tree-list tree-children';
      const key = ++serial;
      notes.id = `notes-${key}`;
      children.id = `children-${key}`;
      notes.hidden = children.hidden = true;

      function addIconButton(label) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'node-toggle';
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.classList.add('toggle-icon');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('aria-hidden', 'true');
        icon.setAttribute('focusable', 'false');
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', `tree_of_life/icons/toggles.svg#${label}`);
        icon.append(use);
        button.append(icon);
        row.append(button);
        return button;
      }

      function addToggle(label, panel, enabled, populate, initiallyOpen = false) {
        const button = addIconButton(label);
        button.disabled = !enabled;
        button.setAttribute('aria-controls', panel.id);
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
      }

      addToggle('notes', notes, node.notes.length > 0, () => {
        for (const text of node.notes) appendNotes(notes, text);
      });
      if (continuationFile) {
        const button = addIconButton('children');
        const label = rootName(continuationFile);
        button.classList.add('node-file-open');
        button.title = `Open ${label} tab`;
        button.setAttribute('aria-label', button.title);
        const arrow = document.createElement('span');
        arrow.className = 'file-open-arrow';
        arrow.textContent = '↗';
        arrow.setAttribute('aria-hidden', 'true');
        button.append(arrow);
        button.addEventListener('click', () => openTab(continuationFile, true));
      } else {
        addToggle('children', children, node.children.length > 0 || node.missing, () => {
          for (const child of node.children) children.append(renderNode(child));
          if (node.missing) {
            const status = document.createElement('li');
            status.className = 'status branch-status';
            status.textContent = 'No continuation is available yet.';
            children.append(status);
          }
        }, initiallyExpanded);
      }
      item.append(row);
      if (node.shortDescription) {
        const description = document.createElement('p');
        description.className = 'node-description';
        description.textContent = node.shortDescription;
        item.append(description);
      }
      item.append(notes, children);
      return item;
    }

    const forest = roots.filter(root => !references.has(root.id));
    if (!forest.length) throw new Error('No tree roots are available.');
    const tabList = document.getElementById('tree-tabs');
    const panels = document.getElementById('tree-panels');
    const empty = document.getElementById('tree-empty');
    const tabs = new Map();
    let activeTab = null;
    let tabSerial = 0;

    function rootName(file) {
      const root = fileRoots.get(file);
      return resolve(root).name || root.id || file.split('/').pop().replace(/\.yaml$/, '');
    }

    function activateTab(file, focus = true) {
      if (activeTab) {
        const previous = tabs.get(activeTab);
        if (previous) {
          previous.scrollTop = previous.panel.scrollTop;
          previous.scrollLeft = previous.panel.scrollLeft;
        }
      }
      activeTab = file;
      for (const [key, tab] of tabs) {
        const selected = key === file;
        tab.button.setAttribute('aria-selected', String(selected));
        tab.button.tabIndex = selected ? 0 : -1;
        tab.item.classList.toggle('is-active', selected);
        tab.panel.hidden = !selected;
      }
      empty.hidden = true;
      const tab = tabs.get(file);
      tab.panel.scrollTop = tab.scrollTop;
      tab.panel.scrollLeft = tab.scrollLeft;
      if (focus) {
        tab.button.focus({ preventScroll: true });
        tab.button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }

    function closeTab(file) {
      const order = [...tabs.keys()];
      const position = order.indexOf(file);
      const tab = tabs.get(file);
      tab.item.remove();
      tab.panel.remove();
      tabs.delete(file);
      if (activeTab !== file) {
        tabs.get(activeTab).button.focus({ preventScroll: true });
        return;
      }
      activeTab = null;
      if (tabs.size) {
        activateTab(order[position + 1] || order[position - 1]);
      } else {
        empty.hidden = false;
        empty.querySelector('button').focus({ preventScroll: true });
      }
    }

    function openTab(file, expandRoot = false, focus = true) {
      if (!tabs.has(file)) {
        const label = rootName(file);
        const key = ++tabSerial;
        const item = document.createElement('div');
        item.className = 'tree-tab-item';
        item.setAttribute('role', 'presentation');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tree-tab';
        button.id = `tree-tab-${key}`;
        button.textContent = label;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-controls', `tree-panel-${key}`);
        button.addEventListener('click', () => activateTab(file));
        button.addEventListener('keydown', event => {
          const order = [...tabs.keys()];
          const position = order.indexOf(file);
          let next;
          if (event.key === 'ArrowRight') next = order[(position + 1) % order.length];
          if (event.key === 'ArrowLeft') next = order[(position + order.length - 1) % order.length];
          if (event.key === 'Home') next = order[0];
          if (event.key === 'End') next = order[order.length - 1];
          if (next) {
            event.preventDefault();
            activateTab(next);
          } else if (event.key === 'Delete') {
            event.preventDefault();
            closeTab(file);
          }
        });
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'tree-tab-close';
        close.textContent = '×';
        close.title = `Close ${label} tab`;
        close.setAttribute('aria-label', close.title);
        close.addEventListener('click', () => closeTab(file));
        item.append(button, close);
        const panel = document.createElement('div');
        panel.className = 'tree-panel';
        panel.id = `tree-panel-${key}`;
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', button.id);
        panel.tabIndex = 0;
        const tree = document.createElement('ul');
        tree.className = 'tree-list';
        tree.append(renderNode(fileRoots.get(file), expandRoot));
        panel.append(tree);
        // Keep each panel mounted so notes and expanded branches survive tab switches.
        tabs.set(file, { item, button, panel, scrollTop: 0, scrollLeft: 0 });
        tabList.append(item);
        panels.append(panel);
      }
      activateTab(file, focus);
    }

    for (const root of forest) {
      const file = sourceFiles.get(root);
      const reopen = document.createElement('button');
      reopen.type = 'button';
      reopen.className = 'tree-reopen';
      reopen.textContent = `Open ${rootName(file)}`;
      reopen.addEventListener('click', () => openTab(file));
      empty.append(reopen);
      openTab(file, false, false);
    }
    activateTab(sourceFiles.get(forest[0]), false);
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
