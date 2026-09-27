const sanitizeHtml=require('sanitize-html');
function cleanRichContent(content = '') {
  return sanitizeHtml(content, {
    allowedTags: ['p', 'br', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'blockquote', 'a', 'hr', 'figure', 'img', 'figcaption', 'div', 'span'],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      figure: ['class', 'style'],
      img: ['src', 'alt', 'style'],
      p: ['style'],
      div: ['style'],
      span: ['style']
    },
    allowedClasses: {
      figure: ['article-figure', 'align-left', 'align-center', 'align-right']
    },
    allowedStyles: {
      '*': {
        'text-align': [/^(left|center|right|justify)$/],
        'width': [/^(33|50|75|100)%$/],
        'height': [/^auto$/]
      }
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowProtocolRelative: false
  });
}


module.exports=cleanRichContent;
