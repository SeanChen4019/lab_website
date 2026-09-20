(function () {
  class RichPublisher {
    constructor(textareaId, options = {}) {
      this.source = document.getElementById(textareaId);
      this.options = options;
      this.selectedImage = null;
      this.savedRange = null;
      this.build();
    }

    build() {
      this.source.style.display = 'none';
      const shell = document.createElement('div');
      shell.className = 'publisher-editor';
      shell.innerHTML = `
        <div class="publisher-toolbar">
          <select data-format="formatBlock" title="段落样式">
            <option value="p">正文</option>
            <option value="h2">一级标题</option>
            <option value="h3">二级标题</option>
            <option value="blockquote">引用</option>
          </select>
          <span class="toolbar-separator"></span>
          <button type="button" data-cmd="bold" title="加粗"><b>B</b></button>
          <button type="button" data-cmd="italic" title="斜体"><i>I</i></button>
          <button type="button" data-cmd="underline" title="下划线"><u>U</u></button>
          <button type="button" data-cmd="removeFormat" title="清除格式">清除</button>
          <span class="toolbar-separator"></span>
          <button type="button" data-cmd="insertUnorderedList" title="项目列表">• 列表</button>
          <button type="button" data-cmd="insertOrderedList" title="编号列表">1. 列表</button>
          <button type="button" data-cmd="justifyLeft" title="左对齐">左</button>
          <button type="button" data-cmd="justifyCenter" title="居中">中</button>
          <button type="button" data-cmd="justifyRight" title="右对齐">右</button>
          <span class="toolbar-separator"></span>
          <button type="button" data-action="link" title="插入链接">链接</button>
          <button type="button" data-cmd="insertHorizontalRule" title="分隔线">分隔线</button>
          <label class="publisher-upload-btn" title="在光标位置插入图片">＋ 插入图片<input type="file" accept="image/*" hidden></label>
          <span class="toolbar-separator"></span>
          <button type="button" data-action="image-left" title="图片左浮动">图左</button>
          <button type="button" data-action="image-center" title="图片居中">图中</button>
          <button type="button" data-action="image-right" title="图片右浮动">图右</button>
          <select data-action="image-width" title="图片宽度">
            <option value="">图片宽度</option>
            <option value="33%">33%</option>
            <option value="50%">50%</option>
            <option value="75%">75%</option>
            <option value="100%">100%</option>
          </select>
          <span class="toolbar-separator"></span>
          <button type="button" data-cmd="undo" title="撤销">↶</button>
          <button type="button" data-cmd="redo" title="重做">↷</button>
        </div>
        <div class="publisher-hint">可直接粘贴文字和图片；点击正文中的图片后，可设置宽度及左右位置。</div>
        <div class="publisher-canvas article-content" contenteditable="true" spellcheck="true"></div>
        <div class="publisher-status"><span>所见即所得排版</span><span class="publisher-word-count">0 字</span></div>`;
      this.source.insertAdjacentElement('afterend', shell);
      this.shell = shell;
      this.canvas = shell.querySelector('.publisher-canvas');
      this.count = shell.querySelector('.publisher-word-count');
      this.bind();
      this.setContent(this.source.value || '');
    }

    bind() {
      this.canvas.addEventListener('input', () => this.sync());
      this.canvas.addEventListener('keyup', () => this.saveSelection());
      this.canvas.addEventListener('mouseup', () => this.saveSelection());
      this.canvas.addEventListener('click', event => {
        this.shell.querySelectorAll('img.is-selected').forEach(img => img.classList.remove('is-selected'));
        this.selectedImage = event.target.tagName === 'IMG' ? event.target : null;
        if (this.selectedImage) this.selectedImage.classList.add('is-selected');
      });
      this.shell.querySelectorAll('[data-cmd]').forEach(button => {
        button.addEventListener('click', () => {
          this.restoreSelection();
          document.execCommand(button.dataset.cmd, false, null);
          this.canvas.focus();
          this.sync();
        });
      });
      this.shell.querySelector('[data-format]').addEventListener('change', event => {
        this.restoreSelection();
        document.execCommand('formatBlock', false, event.target.value);
        this.sync();
      });
      this.shell.querySelector('[data-action="link"]').addEventListener('click', () => {
        const url = prompt('请输入链接地址（https://…）');
        if (!url) return;
        this.restoreSelection();
        document.execCommand('createLink', false, url);
        this.canvas.querySelectorAll('a').forEach(a => { a.target = '_blank'; a.rel = 'noopener'; });
        this.sync();
      });
      this.shell.querySelector('.publisher-upload-btn input').addEventListener('click', () => this.saveSelection());
      this.shell.querySelector('.publisher-upload-btn input').addEventListener('change', event => this.uploadImage(event.target));
      ['left','center','right'].forEach(side => {
        this.shell.querySelector(`[data-action="image-${side}"]`).addEventListener('click', () => this.alignImage(side));
      });
      this.shell.querySelector('[data-action="image-width"]').addEventListener('change', event => {
        if (!this.selectedImage || !event.target.value) return;
        this.selectedImage.style.width = event.target.value;
        this.selectedImage.style.height = 'auto';
        this.sync();
      });
    }

    saveSelection() {
      const selection = window.getSelection();
      if (selection.rangeCount && this.canvas.contains(selection.anchorNode)) this.savedRange = selection.getRangeAt(0).cloneRange();
    }

    restoreSelection() {
      this.canvas.focus();
      if (!this.savedRange) return;
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(this.savedRange);
    }

    async uploadImage(input) {
      if (!input.files[0]) return;
      const form = new FormData();
      form.append('file', input.files[0]);
      input.disabled = true;
      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + this.options.token() },
          body: form
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.message || '上传失败');
        this.restoreSelection();
        const alt = prompt('请输入图片说明（可留空）', '') || '';
        const figure = `<figure class="article-figure align-center" style="width:100%"><img src="${data.url}" alt="${this.escape(alt)}">${alt ? `<figcaption>${this.escape(alt)}</figcaption>` : ''}</figure><p><br></p>`;
        document.execCommand('insertHTML', false, figure);
        this.sync();
      } catch (error) {
        alert(error.message);
      } finally {
        input.disabled = false;
        input.value = '';
      }
    }

    alignImage(side) {
      if (!this.selectedImage) return alert('请先点击正文中的图片');
      const figure = this.selectedImage.closest('figure') || this.selectedImage;
      figure.classList.remove('align-left','align-center','align-right');
      figure.classList.add('align-' + side);
      this.sync();
    }

    setContent(content) {
      const html = /<[a-z][\s\S]*>/i.test(content)
        ? content
        : content.split(/\n{2,}/).filter(Boolean).map(p => `<p>${this.escape(p).replace(/\n/g,'<br>')}</p>`).join('');
      this.canvas.innerHTML = html || '<p><br></p>';
      this.sync();
    }

    getContent() {
      this.sync();
      return this.source.value;
    }

    sync() {
      this.canvas.querySelectorAll('.is-selected').forEach(el => el.classList.remove('is-selected'));
      this.source.value = this.canvas.innerHTML;
      const text = this.canvas.innerText.replace(/\s/g, '');
      this.count.textContent = text.length + ' 字';
    }

    preview(title, meta) {
      let modal = document.getElementById('publisherPreview');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'publisherPreview';
        modal.className = 'publisher-preview-overlay';
        modal.innerHTML = `
          <div class="publisher-preview-window">
            <div class="publisher-preview-bar">
              <b>发布预览</b>
              <div><button type="button" data-size="desktop">桌面</button><button type="button" data-size="mobile">手机</button><button type="button" data-close>关闭</button></div>
            </div>
            <div class="publisher-preview-stage"><article class="publisher-preview-page"><h1></h1><div class="preview-meta"></div><div class="article-content preview-body"></div></article></div>
          </div>`;
        document.body.appendChild(modal);
        modal.querySelector('[data-close]').onclick = () => modal.classList.remove('active');
        modal.querySelectorAll('[data-size]').forEach(btn => btn.onclick = () => {
          modal.querySelector('.publisher-preview-stage').className = 'publisher-preview-stage ' + btn.dataset.size;
        });
      }
      modal.querySelector('h1').textContent = title || '未命名文章';
      modal.querySelector('.preview-meta').textContent = meta || '';
      modal.querySelector('.preview-body').innerHTML = this.getContent();
      modal.classList.add('active');
    }

    escape(value) {
      const div = document.createElement('div');
      div.textContent = value;
      return div.innerHTML;
    }
  }
  window.RichPublisher = RichPublisher;
})();
