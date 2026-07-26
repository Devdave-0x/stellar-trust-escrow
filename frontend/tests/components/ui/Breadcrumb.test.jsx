import { render, screen } from '@testing-library/react';
import Breadcrumb from '../../../components/ui/Breadcrumb';

describe('Breadcrumb', () => {
  const items = [
    { label: 'Home', href: '/' },
    { label: 'Escrows', href: '/escrows' },
    { label: 'My Escrow' },
  ];

  it('renders nothing when items array is empty', () => {
    const { container } = render(<Breadcrumb items={[]} />);
    expect(container.querySelector('nav')).toBeNull();
  });

  it('renders links for all non-current items', () => {
    render(<Breadcrumb items={items} />);
    // Both breadcrumb lists are in the DOM; find all links
    const links = screen.getAllByRole('link', { name: 'Home' });
    expect(links.length).toBeGreaterThan(0);
    const escrowLinks = screen.getAllByRole('link', { name: 'Escrows' });
    expect(escrowLinks.length).toBeGreaterThan(0);
  });

  it('does not render a link for the last (current) item', () => {
    render(<Breadcrumb items={items} />);
    // The last item should not be a link
    const currentItems = screen.getAllByText('My Escrow');
    currentItems.forEach((el) => {
      expect(el.tagName).not.toBe('A');
    });
  });

  it('marks the last item with aria-current="page"', () => {
    render(<Breadcrumb items={items} />);
    const currentItems = screen.getAllByText('My Escrow');
    const hasAriaCurrent = currentItems.some(
      (el) => el.getAttribute('aria-current') === 'page',
    );
    expect(hasAriaCurrent).toBe(true);
  });

  it('uses "/" as the default separator', () => {
    const { container } = render(<Breadcrumb items={items} />);
    const separators = container.querySelectorAll('[aria-hidden="true"]');
    const slashes = Array.from(separators).filter((el) => el.textContent === '/');
    expect(slashes.length).toBeGreaterThan(0);
  });

  it('uses a custom separator when provided', () => {
    const { container } = render(<Breadcrumb items={items} separator="›" />);
    const separators = container.querySelectorAll('[aria-hidden="true"]');
    const custom = Array.from(separators).filter((el) => el.textContent === '›');
    expect(custom.length).toBeGreaterThan(0);
  });

  it('collapses middle items on mobile when there are more than 3 items', () => {
    const longItems = [
      { label: 'Home', href: '/' },
      { label: 'Section', href: '/section' },
      { label: 'Subsection', href: '/section/sub' },
      { label: 'Detail', href: '/section/sub/detail' },
      { label: 'Current Page' },
    ];
    render(<Breadcrumb items={longItems} />);
    // Mobile list should contain "..." for collapsed items
    const ellipsis = screen.getAllByText('...');
    expect(ellipsis.length).toBeGreaterThan(0);
  });

  it('does not collapse when 3 or fewer items', () => {
    const shortItems = [
      { label: 'Home', href: '/' },
      { label: 'Escrows', href: '/escrows' },
      { label: 'Current' },
    ];
    render(<Breadcrumb items={shortItems} />);
    const ellipsis = screen.queryAllByText('...');
    expect(ellipsis.length).toBe(0);
  });

  it('renders JSON-LD structured data script tag', () => {
    const { container } = render(<Breadcrumb items={items} />);
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    const data = JSON.parse(script.innerHTML);
    expect(data['@type']).toBe('BreadcrumbList');
    expect(data.itemListElement).toHaveLength(3);
  });

  it('JSON-LD positions items starting from 1', () => {
    const { container } = render(<Breadcrumb items={items} />);
    const script = container.querySelector('script[type="application/ld+json"]');
    const data = JSON.parse(script.innerHTML);
    expect(data.itemListElement[0].position).toBe(1);
    expect(data.itemListElement[1].position).toBe(2);
    expect(data.itemListElement[2].position).toBe(3);
  });

  it('JSON-LD includes href for items that have one', () => {
    const { container } = render(<Breadcrumb items={items} />);
    const script = container.querySelector('script[type="application/ld+json"]');
    const data = JSON.parse(script.innerHTML);
    expect(data.itemListElement[0].item).toBe('/');
    expect(data.itemListElement[1].item).toBe('/escrows');
  });

  it('JSON-LD omits item property when href is not provided', () => {
    const { container } = render(<Breadcrumb items={items} />);
    const script = container.querySelector('script[type="application/ld+json"]');
    const data = JSON.parse(script.innerHTML);
    // Last item has no href
    expect(data.itemListElement[2].item).toBeUndefined();
  });
});
