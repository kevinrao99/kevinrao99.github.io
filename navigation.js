(() => {
  // Edit this list to update the navigation on every page with a sidebar.
  // Images, the Resources heading, and quotes stay in each page's HTML.
  const links = [
    ['index.html', 'About Me'],
    ['coursework.html', 'Coursework'],
    ['teaching.html', 'Notes and Teaching'],
    ['tree_of_life.html', 'Tree of Life'],
    ['tree_of_life_2.html', 'Tree of Life 2'],
    ['daniel_27.html', 'Daniel 27']
  ];

  for (const navigation of document.querySelectorAll('[data-site-navigation]')) {
    const list = document.createElement('ul');
    for (const [href, label] of links) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = href;
      link.textContent = label;
      item.append(link);
      list.append(item);
    }
    navigation.replaceChildren(list);
  }
})();
