// Minimal Magnolia REST (nodes v1) client: find component usage, prepare sandbox pages.

export class MagnoliaRest {
  constructor({ baseUrl, user, password }) {
    this.base = baseUrl.replace(/\/$/, '') + '/.rest/nodes/v1';
    this.auth = 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');
  }

  async req(method, path, body) {
    const res = await fetch(this.base + path, {
      method,
      headers: { Authorization: this.auth, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${method} ${path} -> HTTP ${res.status}`);
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }

  get(workspace, path, { depth = 0, metadata = true } = {}) {
    return this.req('GET', `/${workspace}${path}?depth=${depth}&includeMetadata=${metadata}`);
  }

  static props(node) {
    return Object.fromEntries((node?.properties || []).map((p) => [p.name, p.multiple ? p.values : p.values[0]]));
  }

  // Walk the website tree and return every component instance using `templateId`.
  async findUsages(templateId, root = '/', depth = 12) {
    const tree = await this.get('website', root, { depth });
    const hits = [];
    const walk = (node, pagePath) => {
      if (!node) return;
      const props = MagnoliaRest.props(node);
      const isPage = node.type === 'mgnl:page';
      const currentPage = isPage ? node.path : pagePath;
      if (node.type === 'mgnl:component' && props['mgnl:template'] === templateId) {
        hits.push({ page: currentPage, component: node.path, title: props.title || null, lastModified: props['mgnl:lastModified'] });
      }
      (node.nodes || []).forEach((c) => walk(c, currentPage));
    };
    walk(tree, root);
    return hits;
  }

  // Create (or reuse) a hidden sandbox page; optionally clear an area so scenarios start clean.
  async ensurePage(parent, name, template, title) {
    const path = `${parent.replace(/\/$/, '')}/${name}`;
    if (!(await this.get('website', path))) {
      await this.req('PUT', `/website${parent}`, { name, type: 'mgnl:page', path, properties: [] });
    }
    await this.req('POST', `/website${path}`, {
      name, type: 'mgnl:page', path,
      properties: [
        { name: 'mgnl:template', type: 'String', multiple: false, values: [template] },
        { name: 'title', type: 'String', multiple: false, values: [title] },
        { name: 'hideInNav', type: 'Boolean', multiple: false, values: ['true'] },
      ],
    });
    return path;
  }

  async clearArea(pagePath, area) {
    const node = await this.get('website', `${pagePath}/${area}`, { depth: 1, metadata: false });
    for (const c of node?.nodes || []) await this.req('DELETE', `/website${c.path}`);
    return (node?.nodes || []).length;
  }
}
