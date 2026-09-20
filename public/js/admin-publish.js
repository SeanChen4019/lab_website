(function () {
  'use strict';

  const token = localStorage.getItem('token') || '';
  if (!token) {
    window.location.replace('/admin/login?redirect=/admin/publish');
    return;
  }

  const form = document.getElementById('easyPublishForm');
  const editor = new RichPublisher('publishContent', { token: () => token });
  const titleInput = document.getElementById('publishTitle');
  const typeInputs = Array.from(document.querySelectorAll('input[name="publishType"]'));
  const dateInput = document.getElementById('publishDate');
  const submitButton = document.getElementById('publishSubmit');
  const errorBox = document.getElementById('publishError');
  const draftState = document.getElementById('publishDraftState');
  const successPanel = document.getElementById('publishSuccess');
  const draftKey = 'lab-easy-publish-draft';
  let draftTimer = null;

  dateInput.value = new Date().toISOString().slice(0, 10);

  function selectedType() {
    return typeInputs.find(input => input.checked)?.value || 'news';
  }

  function plainText(html) {
    const holder = document.createElement('div');
    holder.innerHTML = html || '';
    return (holder.innerText || '').replace(/\s+/g, ' ').trim();
  }

  function setError(message, field) {
    errorBox.textContent = message;
    errorBox.hidden = false;
    if (field) {
      field.focus();
      field.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function clearError() {
    errorBox.hidden = true;
    errorBox.textContent = '';
  }

  function updateType() {
    const type = selectedType();
    document.querySelectorAll('.publish-type-option').forEach(option => {
      option.classList.toggle('active', option.querySelector('input').checked);
    });
    document.querySelectorAll('.news-only').forEach(element => { element.hidden = type !== 'news'; });
    document.querySelectorAll('.notice-only').forEach(element => { element.hidden = type !== 'notice'; });
    submitButton.innerHTML = type === 'notice'
      ? '<i class="fas fa-paper-plane"></i> 立即发布通知'
      : '<i class="fas fa-paper-plane"></i> 立即发布新闻';
  }

  function draftPayload() {
    return {
      type: selectedType(),
      title: titleInput.value,
      content: editor.getContent(),
      category: document.getElementById('publishCategory').value,
      date: dateInput.value,
      summary: document.getElementById('publishSummary').value,
      cover: document.getElementById('publishCover').value,
      link: document.getElementById('publishLink').value,
      top: document.getElementById('publishTop').checked,
      savedAt: new Date().toISOString()
    };
  }

  function saveDraft() {
    try {
      const draft = draftPayload();
      if (!draft.title && !plainText(draft.content)) {
        localStorage.removeItem(draftKey);
        return;
      }
      localStorage.setItem(draftKey, JSON.stringify(draft));
      draftState.innerHTML = '<i class="fas fa-check-circle"></i> 已自动暂存 ' + new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' });
    } catch (error) {
      draftState.textContent = '浏览器暂存不可用，请及时发布';
    }
  }

  function scheduleDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraft, 700);
  }

  function restoreDraft() {
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey) || 'null');
      if (!draft) return;
      const matchingType = typeInputs.find(input => input.value === draft.type);
      if (matchingType) matchingType.checked = true;
      titleInput.value = draft.title || '';
      editor.setContent(draft.content || '');
      document.getElementById('publishCategory').value = draft.category || 'research';
      dateInput.value = draft.date || dateInput.value;
      document.getElementById('publishSummary').value = draft.summary || '';
      document.getElementById('publishCover').value = draft.cover || '';
      document.getElementById('publishLink').value = draft.link || '';
      document.getElementById('publishTop').checked = Boolean(draft.top);
      document.getElementById('publishTitleCount').textContent = titleInput.value.length;
      if (draft.cover) {
        const preview = document.getElementById('publishCoverPreview');
        preview.src = draft.cover;
        preview.hidden = false;
      }
      draftState.innerHTML = '<i class="fas fa-history"></i> 已恢复上次未发布的内容';
    } catch (error) {
      localStorage.removeItem(draftKey);
    }
  }

  async function uploadCover(file) {
    if (!file) return;
    const status = document.getElementById('publishUploadStatus');
    const coverInput = document.getElementById('publishCover');
    const preview = document.getElementById('publishCoverPreview');
    status.textContent = '正在上传…';
    const body = new FormData();
    body.append('file', file);
    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || '上传失败');
      coverInput.value = data.url;
      preview.src = data.url;
      preview.hidden = false;
      status.textContent = '上传成功';
      scheduleDraft();
    } catch (error) {
      status.textContent = error.message;
      setError(error.message);
    }
  }

  async function publish(event) {
    event.preventDefault();
    clearError();
    const type = selectedType();
    const title = titleInput.value.trim();
    const content = editor.getContent();
    const contentText = plainText(content);
    if (!title) return setError('请先填写标题。', titleInput);
    if (!contentText) return setError('请填写正文内容。', editor.canvas);

    const common = {
      title,
      content,
      publish_date: dateInput.value || new Date().toISOString().slice(0, 10),
      is_top: document.getElementById('publishTop').checked ? 1 : 0,
      is_active: 1
    };
    const payload = type === 'news'
      ? Object.assign(common, {
          category: document.getElementById('publishCategory').value,
          summary: document.getElementById('publishSummary').value.trim() || contentText.slice(0, 180),
          image_url: document.getElementById('publishCover').value.trim()
        })
      : Object.assign(common, { link_url: document.getElementById('publishLink').value.trim() });

    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在发布…';
    try {
      const response = await fetch(type === 'news' ? '/api/news' : '/api/notices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || '发布失败');
      localStorage.removeItem(draftKey);
      document.getElementById('publishSuccessTitle').textContent = title;
      document.getElementById('publishViewLink').href = data.url || (type === 'news' ? '/news/' : '/notice/') + data.id;
      successPanel.dataset.publishedId = data.id;
      successPanel.dataset.publishedType = type;
      successPanel.hidden = false;
      form.hidden = true;
      successPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
      setError(error.message || '发布失败，请稍后再试。');
    } finally {
      submitButton.disabled = false;
      updateType();
    }
  }

  function resetForm() {
    form.reset();
    typeInputs[0].checked = true;
    titleInput.value = '';
    editor.setContent('');
    dateInput.value = new Date().toISOString().slice(0, 10);
    document.getElementById('publishCoverPreview').hidden = true;
    document.getElementById('publishUploadStatus').textContent = '';
    successPanel.hidden = true;
    form.hidden = false;
    clearError();
    updateType();
    titleInput.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  typeInputs.forEach(input => input.addEventListener('change', function () {
    updateType();
    scheduleDraft();
  }));
  titleInput.addEventListener('input', function () {
    document.getElementById('publishTitleCount').textContent = titleInput.value.length;
  });
  form.addEventListener('input', scheduleDraft);
  form.addEventListener('submit', publish);
  document.getElementById('publishCoverFile').addEventListener('change', event => uploadCover(event.target.files[0]));
  document.getElementById('publishPreview').addEventListener('click', function () {
    clearError();
    if (!titleInput.value.trim()) return setError('请先填写标题，再查看预览。', titleInput);
    editor.preview(titleInput.value.trim(), '发布时间：' + (dateInput.value || '今天'));
  });
  document.getElementById('publishAnother').addEventListener('click', resetForm);
  document.getElementById('publishLogout').addEventListener('click', async function () {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (error) {}
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/admin/login';
  });

  restoreDraft();
  updateType();
})();
