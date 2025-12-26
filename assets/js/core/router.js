export function getParam(name, url = location.href) {
  const u = new URL(url);
  return u.searchParams.get(name);
}

export function setTitle(title) {
  if (title) document.title = title;
}
