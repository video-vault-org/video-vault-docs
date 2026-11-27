// Language links work without JavaScript. This preserves sections and old English bookmarks.
const currentLanguage = document.documentElement.lang;
const otherLanguage = currentLanguage === 'de' ? 'en' : 'de';

const synchronizeSection = function () {
  const fragment = location.hash;
  if (fragment.startsWith(`#${otherLanguage}-`)) {
    location.replace(`../${otherLanguage}/security.html${fragment}`);
    return;
  }
  const other = document.querySelector(`.tabs a[hreflang="${otherLanguage}"]`);
  if (other) {
    const translated = fragment.startsWith(`#${currentLanguage}-`) ? fragment.replace(`#${currentLanguage}-`, `#${otherLanguage}-`) : '';
    other.setAttribute('href', `../${otherLanguage}/security.html${translated}`);
  }
};

synchronizeSection();

window.addEventListener('hashchange', synchronizeSection);
