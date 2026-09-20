(function () {
  'use strict';

  const token = localStorage.getItem('token') || '';

  // 检查 token 是否即将过期（JWT exp 时间戳）
  function tokenExpiringSoon() {
    try {
      if (!token) return true;
      const payload = JSON.parse(atob(token.split('.')[1]));
      return (payload.exp * 1000) - Date.now() < 300_000; // 5分钟内过期
    } catch (e) {
      return true;
    }
  }

  const headers = function (json) {
    const value = token ? { Authorization: 'Bearer ' + token } : {};
    if (json) value['Content-Type'] = 'application/json';
    return value;
  };

  // 客户端富文本清洗（防御层）
  function sanitizeRichHTML(html) {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    // 移除 script 标签
    div.querySelectorAll('script,iframe,object,embed').forEach(el => el.remove());
    // 移除 on* 事件属性
    div.querySelectorAll('*').forEach(el => {
      Array.from(el.attributes).forEach(attr => {
        if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
      });
    });
    return div.innerHTML;
  }

  const typeLabels = {
    banner: '首页轮播图',
    team: '团队成员',
    news: '新闻文章',
    notice: '通知公告',
    'research-area': '研究方向',
    project: '科研项目',
    download: '下载资源',
    'page-content': '页面文案'
  };

  const configs = {
    'page-content': {
      endpoint: '/api/page-content',
      title: item => item.label || '页面文案',
      subtitle: () => '前台固定栏目文字',
      fields: [
        { key:'content', label:'页面正文', type:'rich', required:true, full:true }
      ],
      defaults: { content:'<p></p>' }
    },
    banner: {
      endpoint: '/api/banners',
      collection: 'banners',
      title: item => item.title || '未命名轮播图',
      subtitle: item => item.link_url || '首页展示',
      image: item => item.image_url,
      fields: [
        { key:'title', label:'轮播图名称', required:true, full:true },
        { key:'image_url', label:'背景图片', type:'image', required:true, full:true },
        { key:'link_url', label:'点击跳转地址', full:true },
        { key:'sort_order', label:'显示顺序', type:'number' },
        { key:'is_active', label:'前台显示', type:'checkbox' }
      ],
      defaults: { title:'新轮播图', image_url:'', link_url:'/about', sort_order:0, is_active:1 }
    },
    team: {
      endpoint: '/api/team',
      collection: 'members',
      title: item => item.name || '未命名成员',
      subtitle: item => [item.title,item.research_area].filter(Boolean).join(' · '),
      image: item => item.photo_url,
      fields: [
        { key:'name', label:'姓名', required:true },
        { key:'title', label:'职称 / 身份' },
        { key:'member_type', label:'人才类型', type:'select', options:{ teacher:'教师', student:'学生' } },
        { key:'role', label:'团队角色（教师）', type:'select', options:{ leader:'团队负责人', member:'普通教师 / 学生' } },
        { key:'member_status', label:'学生状态', type:'select', options:{ current:'在读', alumni:'已毕业' } },
        { key:'student_level', label:'培养层次（学生）', type:'select', options:{ '':'不适用', undergraduate:'本科生', master:'硕士研究生', doctor:'博士研究生' } },
        { key:'enrollment_year', label:'入学年份', type:'number' },
        { key:'graduation_year', label:'毕业年份', type:'number' },
        { key:'email', label:'联系邮箱', type:'email' },
        { key:'research_area', label:'研究方向', full:true },
        { key:'bio', label:'个人简介', type:'textarea', full:true },
        { key:'resume', label:'个人履历（每行一条）', type:'textarea', full:true },
        { key:'recent_updates', label:'近期动态（日期｜标题｜链接，每行一条）', type:'textarea', full:true },
        { key:'destination', label:'毕业去向（学生）', full:true },
        { key:'photo_url', label:'成员照片', type:'image', full:true },
        { key:'sort_order', label:'显示顺序', type:'number' },
        { key:'is_active', label:'前台显示', type:'checkbox' }
      ],
      defaults: {
        name:'', title:'', member_type:'teacher', role:'member', member_status:'current', student_level:'',
        enrollment_year:null, graduation_year:null, email:'', research_area:'', bio:'', resume:'', recent_updates:'',
        destination:'', photo_url:'', sort_order:0, is_active:1
      }
    },
    news: {
      endpoint: '/api/news',
      collection: 'news',
      title: item => item.title || '未命名文章',
      subtitle: item => (item.publish_date || '') + ' · ' + ({team:'团队动态',research:'科研动态',teaching:'教学动态',exchange:'合作交流',education:'人才培养'}[item.category] || item.category || ''),
      image: item => item.image_url,
      fields: [
        { key:'title', label:'文章标题', required:true, full:true },
        { key:'category', label:'所属栏目', type:'select', options:{ team:'团队动态', research:'科研动态', teaching:'教学动态', exchange:'合作交流', education:'人才培养' } },
        { key:'publish_date', label:'发布日期', type:'date' },
        { key:'summary', label:'内容摘要', type:'textarea', full:true },
        { key:'image_url', label:'封面图片', type:'image', full:true },
        { key:'content', label:'文章正文', type:'rich', full:true },
        { key:'is_top', label:'置顶显示', type:'checkbox' },
        { key:'is_active', label:'前台显示', type:'checkbox' }
      ],
      defaults: { title:'', category:'research', publish_date:new Date().toISOString().slice(0,10), summary:'', image_url:'', content:'<p></p>', is_top:0, is_active:1 }
    },
    notice: {
      endpoint: '/api/notices',
      collection: 'notices',
      title: item => item.title || '未命名通知',
      subtitle: item => item.publish_date || '',
      fields: [
        { key:'title', label:'通知标题', required:true, full:true },
        { key:'publish_date', label:'发布日期', type:'date' },
        { key:'link_url', label:'相关链接' },
        { key:'content', label:'通知正文', type:'rich', full:true },
        { key:'is_top', label:'置顶显示', type:'checkbox' },
        { key:'is_active', label:'前台显示', type:'checkbox' }
      ],
      defaults: { title:'', publish_date:new Date().toISOString().slice(0,10), link_url:'', content:'<p></p>', is_top:0, is_active:1 }
    },
    'research-area': {
      endpoint: '/api/research-areas',
      collection: 'areas',
      title: item => item.title || '未命名研究方向',
      subtitle: item => item.description || '',
      fields: [
        { key:'title', label:'研究方向名称', required:true, full:true },
        { key:'description', label:'方向说明', type:'textarea', required:true, full:true },
        { key:'icon', label:'图标名称', hint:'例如 satellite、wifi、brain' },
        { key:'sort_order', label:'显示顺序', type:'number' },
        { key:'is_active', label:'前台显示', type:'checkbox' }
      ],
      defaults: { title:'', description:'', icon:'satellite', sort_order:0, is_active:1 }
    },
    project: {
      endpoint: '/api/projects',
      collection: 'projects',
      title: item => item.title || '未命名项目',
      subtitle: item => [item.funding_source,item.status].filter(Boolean).join(' · '),
      fields: [
        { key:'title', label:'项目名称', required:true, full:true },
        { key:'funding_source', label:'项目来源', full:true },
        { key:'description', label:'项目简介', type:'textarea', required:true, full:true },
        { key:'start_date', label:'开始日期', type:'date' },
        { key:'end_date', label:'结束日期', type:'date' },
        { key:'status', label:'项目状态', type:'select', options:{ '进行中':'进行中', '已完成':'已完成', '筹备中':'筹备中' } },
        { key:'is_active', label:'前台显示', type:'checkbox' }
      ],
      defaults: { title:'', funding_source:'', description:'', start_date:'', end_date:'', status:'进行中', is_active:1 }
    },
    download: {
      endpoint: '/api/downloads',
      collection: 'downloads',
      title: item => item.title || '未命名资源',
      subtitle: item => [item.category,item.file_size].filter(Boolean).join(' · '),
      fields: [
        { key:'title', label:'资源名称', required:true, full:true },
        { key:'category', label:'资源分类' },
        { key:'file_size', label:'文件大小' },
        { key:'description', label:'资源说明', type:'textarea', full:true },
        { key:'file_url', label:'文件地址', type:'file', required:true, full:true },
        { key:'is_active', label:'前台显示', type:'checkbox' }
      ],
      defaults: { title:'', description:'', file_url:'', file_size:'', category:'其他', is_active:1 }
    }
  };

  const pageTitles = {
    '/':'首页',
    '/about':'实验室概况',
    '/team':'团队建设',
    '/research':'科学研究',
    '/projects':'重大项目',
    '/education':'人才培养',
    '/exchange':'合作交流',
    '/downloads':'相关下载'
  };

  const elements = {
    body: document.body,
    nav: document.getElementById('visualPageNav'),
    preview: document.getElementById('visualPreview'),
    stage: document.getElementById('visualStage'),
    loading: document.getElementById('visualLoading'),
    address: document.getElementById('visualAddress'),
    pageTitle: document.getElementById('visualPageTitle'),
    editor: document.getElementById('visualEditor'),
    editorTitle: document.getElementById('visualEditorTitle'),
    editorEyebrow: document.getElementById('visualEditorEyebrow'),
    editorBody: document.getElementById('visualEditorBody'),
    editorFooter: document.getElementById('visualEditorFooter'),
    save: document.getElementById('visualSave'),
    delete: document.getElementById('visualDelete'),
    toast: document.getElementById('visualToast')
  };
  elements.add = document.getElementById('visualAdd');
  elements.contentList = document.getElementById('visualContentList');

  let currentPage = elements.body.dataset.initialPage || '/team';
  let editing = null;
  let toastTimer = null;

  function showToast(message, kind) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.className = 'visual-toast show ' + (kind || '');
    toastTimer = setTimeout(() => { elements.toast.className = 'visual-toast'; }, 2600);
  }

  async function api(url, options) {
    const response = await fetch(url, Object.assign({ headers:headers(Boolean(options && options.body)) }, options || {}));
    if (response.status === 401) {
      window.location.href = '/admin/login?redirect=' + encodeURIComponent(window.location.pathname);
      throw new Error('登录状态已失效');
    }
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || '操作失败');
    return data;
  }

  function previewUrl(page) {
    return page + (page.includes('?') ? '&' : '?') + 'cms=1';
  }

  function selectPage(page) {
    currentPage = page || '/';
    elements.loading.classList.remove('hidden');
    elements.preview.src = previewUrl(currentPage);
    elements.address.textContent = window.location.origin + currentPage;
    elements.pageTitle.textContent = pageTitles[currentPage] || '页面预览';
    document.querySelectorAll('[data-page]').forEach(button => {
      button.classList.toggle('active', button.dataset.page === currentPage);
    });
    const pageButton = document.querySelector('[data-page="' + currentPage + '"]');
    const canCreate = Boolean(pageButton?.dataset.create);
    elements.add.hidden = !canCreate;
    elements.contentList.hidden = !canCreate;
    closeEditor();
  }

  function openEditorShell(title, eyebrow) {
    elements.editorTitle.textContent = title;
    elements.editorEyebrow.textContent = eyebrow || '内容编辑';
    elements.editor.classList.add('open');
    elements.editor.setAttribute('aria-hidden','false');
  }

  function closeEditor() {
    elements.editor.classList.remove('open');
    elements.editor.setAttribute('aria-hidden','true');
    elements.editorFooter.hidden = true;
    editing = null;
  }

  function createInput(field, value) {
    const wrapper = document.createElement('div');
    wrapper.className = 'visual-field' + (field.full || ['textarea','image','file','rich'].includes(field.type) ? ' full' : '');
    wrapper.dataset.field = field.key;

    const label = document.createElement('label');
    label.textContent = field.label;
    if (field.required) {
      const required = document.createElement('em');
      required.textContent = '*';
      label.appendChild(required);
    }
    wrapper.appendChild(label);

    if (field.type === 'checkbox') {
      const row = document.createElement('label');
      row.className = 'visual-check';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = Number(value) === 1 || value === true;
      input.dataset.input = field.key;
      const text = document.createElement('span');
      text.textContent = '启用';
      row.append(input,text);
      wrapper.appendChild(row);
      return wrapper;
    }

    if (field.type === 'select') {
      const select = document.createElement('select');
      select.dataset.input = field.key;
      Object.entries(field.options || {}).forEach(([optionValue, optionLabel]) => {
        const option = document.createElement('option');
        option.value = optionValue;
        option.textContent = optionLabel;
        option.selected = String(value ?? '') === String(optionValue);
        select.appendChild(option);
      });
      wrapper.appendChild(select);
      return wrapper;
    }

    if (field.type === 'rich') {
      const toolbar = document.createElement('div');
      toolbar.className = 'visual-rich-toolbar';
      [
        ['粗体','bold'],['标题','formatBlock','H2'],['正文','formatBlock','P'],
        ['列表','insertUnorderedList'],['引用','formatBlock','BLOCKQUOTE'],['链接','createLink']
      ].forEach(command => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = command[0];
        button.addEventListener('click', function () {
          const editor = wrapper.querySelector('.visual-rich-editor');
          editor.focus();
          let argument = command[2] || null;
          if (command[1] === 'createLink') argument = window.prompt('请输入链接地址', 'https://');
          if (argument !== null || command[1] !== 'createLink') document.execCommand(command[1], false, argument);
        });
        toolbar.appendChild(button);
      });
      const editor = document.createElement('div');
      editor.className = 'visual-rich-editor';
      editor.contentEditable = 'true';
      editor.dataset.input = field.key;
      editor.dataset.kind = 'rich';
      editor.innerHTML = sanitizeRichHTML(value || '');
      wrapper.append(toolbar,editor);
      return wrapper;
    }

    if (field.type === 'image' || field.type === 'file') {
      const row = document.createElement('div');
      row.className = 'visual-image-row';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = value || '';
      input.dataset.input = field.key;
      const upload = document.createElement('label');
      upload.className = 'visual-upload-button';
      upload.textContent = field.type === 'image' ? '上传图片' : '上传文件';
      const file = document.createElement('input');
      file.type = 'file';
      file.accept = field.type === 'image' ? 'image/*' : '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar';
      upload.appendChild(file);
      row.append(input,upload);
      wrapper.appendChild(row);

      let preview;
      if (field.type === 'image') {
        preview = document.createElement('img');
        preview.className = 'visual-image-preview';
        preview.src = value || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="600" height="240"%3E%3Crect width="100%25" height="100%25" fill="%23f0f3f7"/%3E%3C/svg%3E';
        wrapper.appendChild(preview);
        input.addEventListener('input', () => { preview.src = input.value || preview.src; });
      }

      file.addEventListener('change', async function () {
        if (!file.files[0]) return;
        upload.textContent = '上传中…';
        upload.appendChild(file);
        const form = new FormData();
        form.append('file', file.files[0]);
        try {
          const response = await fetch('/api/upload', { method:'POST', headers:headers(false), body:form });
          const data = await response.json();
          if (!data.success) throw new Error(data.message || '上传失败');
          input.value = data.url;
          if (preview) preview.src = data.url;
          showToast('文件上传成功','success');
        } catch (error) {
          showToast(error.message,'error');
        } finally {
          upload.childNodes[0].textContent = field.type === 'image' ? '上传图片' : '上传文件';
        }
      });
      return wrapper;
    }

    const input = field.type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
    if (input.tagName === 'INPUT') input.type = field.type || 'text';
    input.value = value ?? '';
    input.dataset.input = field.key;
    if (field.required) input.required = true;
    wrapper.appendChild(input);
    if (field.hint) {
      const note = document.createElement('small');
      note.textContent = field.hint;
      wrapper.appendChild(note);
    }
    return wrapper;
  }

  function renderForm(type, item, isNew) {
    const config = configs[type];
    const form = document.createElement('form');
    form.className = 'visual-form';
    form.id = 'visualEditForm';
    config.fields.forEach(field => form.appendChild(createInput(field, item[field.key])));
    const note = document.createElement('div');
    note.className = 'visual-form-note';
    note.textContent = isNew
      ? '填写后保存，内容会立即出现在对应的前台页面中。'
      : '保存后中央预览会自动刷新，你可以直接核对实际展示效果。';
    form.appendChild(note);
    elements.editorBody.replaceChildren(form);
    elements.editorFooter.hidden = false;
    elements.delete.hidden = isNew || type === 'page-content';
    editing = { type:type, id:isNew ? null : item.id, item:item, isNew:isNew };
    openEditorShell((isNew ? '添加' : '编辑') + typeLabels[type], isNew ? '新建内容' : '所见即所得编辑');
  }

  async function loadItem(type, id, snapshot) {
    const config = configs[type];
    if (!config) return;
    openEditorShell('正在读取…', typeLabels[type]);
    elements.editorBody.innerHTML = '<div class="visual-empty-state"><span>…</span><h3>正在载入内容</h3></div>';
    try {
      if (type === 'page-content') {
        const data = await api(config.endpoint + '/' + encodeURIComponent(id));
        renderForm(type,{
          id:id,
          label:snapshot?.label || '页面文案',
          content:data.content || snapshot?.content || '<p></p>'
        },false);
        return;
      }
      const data = await api(config.endpoint);
      const item = (data[config.collection] || []).find(entry => Number(entry.id) === Number(id));
      if (!item) throw new Error('没有找到这条内容');
      renderForm(type,item,false);
    } catch (error) {
      elements.editorBody.innerHTML = '<div class="visual-empty-state"><span>!</span><h3>载入失败</h3><p></p></div>';
      elements.editorBody.querySelector('p').textContent = error.message;
      showToast(error.message,'error');
    }
  }

  function collectPayload() {
    const config = configs[editing.type];
    const payload = {};
    config.fields.forEach(field => {
      const input = elements.editorBody.querySelector('[data-input="' + field.key + '"]');
      if (!input) return;
      if (field.type === 'checkbox') payload[field.key] = input.checked ? 1 : 0;
      else if (field.type === 'number') payload[field.key] = input.value === '' ? null : Number(input.value);
      else if (field.type === 'rich') payload[field.key] = sanitizeRichHTML(input.innerHTML);
      else payload[field.key] = input.value;
    });
    return payload;
  }

  async function saveCurrent() {
    if (!editing) return;

    // 保存前检查 token 是否即将过期
    if (tokenExpiringSoon()) {
      // 备份当前编辑内容到 localStorage
      try {
        const payload = collectPayload();
        localStorage.setItem('cms-draft-' + editing.type, JSON.stringify({
          payload: payload,
          id: editing.id,
          isNew: editing.isNew,
          savedAt: new Date().toISOString()
        }));
      } catch (e) { /* 忽略存储错误 */ }
      showToast('登录状态已过期，编辑内容已暂存，请重新登录','error');
      setTimeout(() => {
        window.location.href = '/admin/login?redirect=' + encodeURIComponent(window.location.pathname);
      }, 1500);
      return;
    }

    const config = configs[editing.type];
    const payload = collectPayload();
    const missing = config.fields.find(field => field.required && !String(payload[field.key] || '').trim());
    if (missing) {
      showToast('请填写”' + missing.label + '”','error');
      elements.editorBody.querySelector('[data-input="' + missing.key + '"]')?.focus();
      return;
    }
    elements.save.disabled = true;
    elements.save.textContent = '保存中…';
    try {
      const url = editing.id ? config.endpoint + '/' + encodeURIComponent(editing.id) : config.endpoint;
      const method = editing.type === 'page-content' ? 'PUT' : (editing.id ? 'PUT' : 'POST');
      await api(url,{ method:method, body:JSON.stringify(payload) });
      showToast(editing.id ? '修改已保存，预览已更新' : '内容已添加，预览已更新','success');
      // 清除对应草稿
      localStorage.removeItem('cms-draft-' + editing.type);
      closeEditor();
      elements.loading.classList.remove('hidden');
      elements.preview.contentWindow.location.reload();
    } catch (error) {
      showToast(error.message,'error');
    } finally {
      elements.save.disabled = false;
      elements.save.textContent = '保存并刷新';
    }
  }

  async function deleteCurrent() {
    if (!editing || !editing.id) return;
    const config = configs[editing.type];
    if (!window.confirm('确定删除这条内容吗？删除后无法从前台恢复。')) return;
    try {
      await api(config.endpoint + '/' + editing.id,{ method:'DELETE' });
      showToast('内容已删除','success');
      closeEditor();
      elements.preview.contentWindow.location.reload();
    } catch (error) {
      showToast(error.message,'error');
    }
  }

  function defaultTypeForPage() {
    const button = document.querySelector('[data-page="' + currentPage + '"]');
    return button?.dataset.create || (currentPage.startsWith('/news/') ? 'news' : null);
  }

  function addForCurrentPage() {
    const type = defaultTypeForPage();
    if (!type) return showToast('这个页面没有可新增的列表内容，请直接点击蓝色边框区域编辑。','error');
    const config = configs[type];
    const item = Object.assign({},config.defaults);
    const button = document.querySelector('[data-page="' + currentPage + '"]');
    if (type === 'news' && button?.dataset.category) item.category = button.dataset.category;
    renderForm(type,item,true);
  }

  async function showContentList() {
    const type = defaultTypeForPage();
    if (!type) return showToast('这个页面没有内容列表，请直接点击页面中的可编辑区域。','error');
    const config = configs[type];
    openEditorShell(typeLabels[type] + '列表','当前页面内容');
    elements.editorFooter.hidden = true;
    elements.editorBody.innerHTML = '<div class="visual-empty-state"><span>…</span><h3>正在读取内容</h3></div>';
    try {
      const data = await api(config.endpoint);
      const items = data[config.collection] || [];
      const fragment = document.createDocumentFragment();
      const intro = document.createElement('p');
      intro.className = 'visual-list-intro';
      intro.textContent = '列表也会显示被隐藏的内容。点击任意一项即可编辑。';
      fragment.appendChild(intro);
      const list = document.createElement('div');
      list.className = 'visual-list';
      items.forEach(item => {
        const button = document.createElement('button');
        button.className = 'visual-list-item';
        const imageUrl = config.image ? config.image(item) : '';
        if (imageUrl) {
          const img = document.createElement('img');
          img.src = imageUrl;
          img.alt = '';
          button.appendChild(img);
        }
        const copy = document.createElement('span');
        const title = document.createElement('strong');
        title.textContent = config.title(item);
        const subtitle = document.createElement('small');
        subtitle.textContent = config.subtitle ? config.subtitle(item) : '';
        copy.append(title,subtitle);
        const status = document.createElement('b');
        status.textContent = Number(item.is_active) === 1 ? '显示中' : '已隐藏';
        if (Number(item.is_active) !== 1) status.className = 'off';
        button.append(copy,status);
        button.addEventListener('click',() => loadItem(type,item.id));
        list.appendChild(button);
      });
      if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'visual-empty-state';
        empty.innerHTML = '<span>○</span><h3>暂无内容</h3><p>点击顶部“添加内容”创建第一条内容。</p>';
        list.appendChild(empty);
      }
      fragment.appendChild(list);
      elements.editorBody.replaceChildren(fragment);
    } catch (error) {
      showToast(error.message,'error');
    }
  }

  elements.nav.addEventListener('click',function (event) {
    const button = event.target.closest('[data-page]');
    if (button) selectPage(button.dataset.page);
  });

  document.querySelectorAll('[data-device]').forEach(button => {
    button.addEventListener('click',function () {
      document.querySelectorAll('[data-device]').forEach(item => item.classList.remove('active'));
      button.classList.add('active');
      elements.stage.dataset.device = button.dataset.device;
    });
  });

  document.getElementById('visualRefresh').addEventListener('click',() => {
    elements.loading.classList.remove('hidden');
    elements.preview.contentWindow.location.reload();
  });
  elements.contentList.addEventListener('click',showContentList);
  elements.add.addEventListener('click',addForCurrentPage);
  document.getElementById('visualEditorClose').addEventListener('click',closeEditor);
  document.getElementById('visualCancel').addEventListener('click',closeEditor);
  elements.save.addEventListener('click',saveCurrent);
  elements.delete.addEventListener('click',deleteCurrent);
  elements.preview.addEventListener('load',() => elements.loading.classList.add('hidden'));

  document.getElementById('visualLogout').addEventListener('click',async function () {
    try { await fetch('/api/auth/logout',{method:'POST'}); } catch (error) {}
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/admin/login';
  });

  window.addEventListener('message',function (event) {
    if (event.origin !== window.location.origin || event.data?.source !== 'nuaa-cms-preview') return;
    if (event.data.action === 'edit') loadItem(event.data.type,event.data.id,event.data);
    if (event.data.action === 'ready') {
      elements.loading.classList.add('hidden');
      currentPage = event.data.path;
      elements.address.textContent = window.location.origin + currentPage;
      elements.pageTitle.textContent = event.data.title || pageTitles[currentPage] || '页面预览';
      document.querySelectorAll('[data-page]').forEach(button => {
        button.classList.toggle('active',button.dataset.page === currentPage);
      });
    }
  });

  selectPage(currentPage);
})();
