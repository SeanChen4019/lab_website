// =============================================
// 电磁频谱认知智能通信实验室网站前端脚本
// =============================================

document.addEventListener('DOMContentLoaded', function() {
  // 初始化轮播图
  initBannerSlider();

  // 初始化移动端菜单
  initMobileMenu();

  // 初始化访客计数器
  initVisitorCounter();

  // 初始化滚动揭示与细节动效
  initScrollReveal();
  initHeaderMotion();

  // 搜索框：空关键词不跳转，并给出清晰的输入焦点
  document.querySelectorAll('.site-search-form').forEach(function(form) {
    form.addEventListener('submit', function(event) {
      const input = form.querySelector('input[name="q"]');
      if (!input || !input.value.trim()) {
        event.preventDefault();
        if (input) input.focus();
      }
    });
  });
});

// =============================================
// 轮播图功能
// =============================================
function initBannerSlider() {
  const slider = document.getElementById('bannerSlider');
  if (!slider) return;

  const slides = slider.querySelectorAll('.banner-slide, .hero-slide');
  const dots = document.querySelectorAll('#bannerDots .dot, .hero-dots button');
  const prevBtn = document.getElementById('bannerPrev');
  const nextBtn = document.getElementById('bannerNext');

  if (slides.length === 0) return;

  let currentSlide = 0;
  let autoPlayInterval;

  // 显示指定幻灯片
  function showSlide(index) {
    slides.forEach(slide => slide.classList.remove('active'));
    dots.forEach(dot => { dot.classList.remove('active'); dot.setAttribute('aria-pressed', 'false'); });

    currentSlide = (index + slides.length) % slides.length;

    slides[currentSlide].classList.add('active');
    if (dots[currentSlide]) {
      dots[currentSlide].classList.add('active');
      dots[currentSlide].setAttribute('aria-pressed', 'true');
    }
  }

  // 下一张
  function nextSlide() {
    showSlide(currentSlide + 1);
  }

  // 上一张
  function prevSlide() {
    showSlide(currentSlide - 1);
  }

  // 开始自动播放
  function startAutoPlay() {
    clearInterval(autoPlayInterval);
    if (slides.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches || slider.matches(':hover, :focus-within') || document.hidden) return;
    autoPlayInterval = setInterval(nextSlide, 6500);
  }

  // 停止自动播放
  function stopAutoPlay() {
    clearInterval(autoPlayInterval);
  }

  // 绑定按钮事件
  if (prevBtn) {
    prevBtn.addEventListener('click', function() {
      stopAutoPlay();
      prevSlide();
      startAutoPlay();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', function() {
      stopAutoPlay();
      nextSlide();
      startAutoPlay();
    });
  }

  // 绑定圆点事件
  dots.forEach((dot, index) => {
    dot.addEventListener('click', function() {
      stopAutoPlay();
      showSlide(index);
      startAutoPlay();
    });
  });

  // 鼠标悬停暂停
  slider.addEventListener('mouseenter', stopAutoPlay);
  slider.addEventListener('mouseleave', startAutoPlay);
  slider.addEventListener('focusin', stopAutoPlay);
  slider.addEventListener('focusout', () => setTimeout(startAutoPlay, 0));

  document.addEventListener('visibilitychange', function() {
    if (document.hidden) stopAutoPlay();
    else {
      stopAutoPlay();
      startAutoPlay();
    }
  });

  // 开始自动播放
  startAutoPlay();
}

// =============================================
// 移动端菜单
// =============================================
function initMobileMenu() {
  const menuBtn = document.getElementById('mobileMenuBtn');
  const mobileNav = document.getElementById('mobileNav');

  if (!menuBtn || !mobileNav) return;

  menuBtn.addEventListener('click', function() {
    mobileNav.classList.toggle('active');
    menuBtn.setAttribute('aria-expanded', mobileNav.classList.contains('active') ? 'true' : 'false');

    // 切换图标
    const icon = menuBtn.querySelector('i');
    if (icon && mobileNav.classList.contains('active')) {
      icon.classList.remove('fa-bars');
      icon.classList.add('fa-times');
    } else if (icon) {
      icon.classList.remove('fa-times');
      icon.classList.add('fa-bars');
    }
  });

  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && mobileNav.classList.contains('active')) {
      mobileNav.classList.remove('active');
      menuBtn.setAttribute('aria-expanded', 'false');
      menuBtn.focus();
    }
  });

  // 点击菜单项后关闭菜单
  const menuItems = mobileNav.querySelectorAll('a');
  menuItems.forEach(item => {
    item.addEventListener('click', function() {
      mobileNav.classList.remove('active');
      const icon = menuBtn.querySelector('i');
      menuBtn.setAttribute('aria-expanded', 'false');
      if (icon) {
        icon.classList.remove('fa-times');
        icon.classList.add('fa-bars');
      }
    });
  });
}

// =============================================
// 访客计数器
// =============================================
function initVisitorCounter() {
  const counter = document.getElementById('visitorCount');
  if (!counter) return;

  // 从本地存储获取访问次数
  let count = localStorage.getItem('visitorCount');

  if (!count) {
    count = 0;
  }

  count = parseInt(count) + 1;
  localStorage.setItem('visitorCount', count);

  // 显示访问次数
  counter.textContent = count.toLocaleString();
}

// =============================================
// 平滑滚动
// =============================================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  });
});

// =============================================
// 返回顶部按钮
// =============================================
function addBackToTop() {
  const btn = document.createElement('button');
  btn.innerHTML = '<i class="fas fa-arrow-up"></i>';
  btn.className = 'back-to-top';
  btn.style.cssText = `
    position: fixed;
    bottom: 30px;
    right: 30px;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: #1e3a5f;
    color: white;
    border: none;
    cursor: pointer;
    display: none;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    z-index: 1000;
    transition: all 0.3s ease;
  `;

  document.body.appendChild(btn);

  // 显示/隐藏按钮
  window.addEventListener('scroll', function() {
    if (window.pageYOffset > 300) {
      btn.style.display = 'flex';
    } else {
      btn.style.display = 'none';
    }
  });

  // 点击返回顶部
  btn.addEventListener('click', function() {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  });

  // 悬停效果
  btn.addEventListener('mouseenter', function() {
    this.style.background = '#2b6cb0';
    this.style.transform = 'scale(1.1)';
  });

  btn.addEventListener('mouseleave', function() {
    this.style.background = '#1e3a5f';
    this.style.transform = 'scale(1)';
  });
}

// 初始化返回顶部按钮
addBackToTop();

// =============================================
// 参考站式滚动淡入：轻微上移，不使用夸张弹跳
// =============================================
function initScrollReveal() {
  const selectors = [
    '.home-title',
    '.news-card',
    '.feature-panel',
    '.graduate-copy',
    '.graduate-cards a',
    '.friend-links .container',
    '.page-banner h1',
    '.page-banner p',
    '.content-card'
  ];
  const elements = document.querySelectorAll(selectors.join(','));
  elements.forEach(function(el, index) {
    el.classList.add('reveal-item');
    el.style.setProperty('--reveal-delay', Math.min(index % 4, 3) * 90 + 'ms');
  });

  if (!('IntersectionObserver' in window)) {
    elements.forEach(function(el) { el.classList.add('is-revealed'); });
    return;
  }

  const observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -45px 0px' });

  elements.forEach(function(el) { observer.observe(el); });
}

// 顶部随滚动由透明变为轻微深色，保持文字可读
function initHeaderMotion() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  let ticking = false;
  function updateHeader() {
    header.classList.toggle('is-scrolled', window.scrollY > 70);
    ticking = false;
  }
  window.addEventListener('scroll', function() {
    if (!ticking) {
      window.requestAnimationFrame(updateHeader);
      ticking = true;
    }
  }, { passive: true });
  updateHeader();
}
