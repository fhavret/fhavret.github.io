const _getTheme = () => localStorage.getItem("theme") || "light";
const _setTheme = (theme) => localStorage.setItem("theme", theme);
const _toggleTheme = () => _getTheme() == "dark" ? _setTheme("light") : _setTheme("dark");
const _updateUI = () => document.documentElement.setAttribute('data-bs-theme', _getTheme());
function _rotateElement(element, animate=true) {
  const currentRotation = parseInt(element.style.transform.replace('rotate(', '').replace('deg)', '')) || 0;
  const newRotation = (currentRotation + 180) % 360;
  element.style.transform = `rotate(${newRotation}deg)`;
  if (animate) {
    element.style.transition = 'transform 0.5s ease-out';
  }
}

function toggleTheme(event) {
  _toggleTheme();
  _rotateElement(event.srcElement);
  _updateUI();
}

function setInitialTheme(modeSwitch) {
  if (_getTheme() == "dark") {
    _rotateElement(modeSwitch, animate=false);
  }
  _updateUI();
}