/* When the break room runs inside the Breathing Room site (at /room/), add a link back to the day overview. */
(function () {
  if (!/\/room\/(index\.html)?$/.test(location.pathname)) return;
  var right = document.querySelector('.top-right');
  if (!right) return;
  // The day overview already shows the full timeline, so the break room only shows what's next.
  document.body.classList.add('in-site');
  var a = document.createElement('a');
  a.href = '../';
  a.className = 'btn ghost';
  a.textContent = 'Day overview';
  right.prepend(a);
})();
