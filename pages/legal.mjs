// Which shared pages a site gets, decided from site.json alone (kit() and Layout both use this).
// About and Contact need a real owner (name + email) — the kit never invents who runs a site.
export function sharedPages(s) {
  const owner = !!(s?.owner?.name && s?.owner?.email);
  return [
    ...(owner ? [{ path: '/about-us/', file: 'About.astro', label: 'About' },
                 { path: '/contact-us/', file: 'Contact.astro', label: 'Contact' }] : []),
    { path: '/privacy/', file: 'Privacy.astro', label: 'Privacy' },
    { path: '/terms/', file: 'Terms.astro', label: 'Terms' },
  ];
}
