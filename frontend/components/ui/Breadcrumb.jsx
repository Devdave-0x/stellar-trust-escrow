/**
 * Breadcrumb Component
 *
 * Navigation breadcrumb with mobile collapse and JSON-LD schema.org structured data.
 *
 * @param {object}   props
 * @param {{ label: string, href?: string }[]} props.items - Breadcrumb items; last item is current page
 * @param {string}   [props.separator='/'] - Separator character between items
 */

'use client';

import Link from 'next/link';

export default function Breadcrumb({ items = [], separator = '/' }) {
  if (!items.length) return null;

  const lastIndex = items.length - 1;

  /**
   * Mobile collapse logic: show only first item and last two items when there
   * are more than 3 items, replacing the middle with an ellipsis.
   */
  const getVisibleItems = () => {
    if (items.length <= 3) return items.map((item, i) => ({ ...item, originalIndex: i }));
    return [
      { ...items[0], originalIndex: 0 },
      { label: '...', href: undefined, collapsed: true, originalIndex: -1 },
      ...items.slice(-2).map((item, i) => ({ ...item, originalIndex: items.length - 2 + i })),
    ];
  };

  const visibleItems = getVisibleItems();

  // Build JSON-LD BreadcrumbList structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      ...(item.href ? { item: item.href } : {}),
    })),
  };

  return (
    <>
      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav aria-label="Breadcrumb">
        {/* Full breadcrumb — visible on sm+ screens */}
        <ol className="hidden sm:flex items-center gap-1 text-sm text-gray-500 flex-wrap">
          {items.map((item, index) => {
            const isLast = index === lastIndex;
            return (
              <li key={index} className="flex items-center gap-1">
                {index > 0 && (
                  <span aria-hidden="true" className="select-none text-gray-400">
                    {separator}
                  </span>
                )}
                {isLast ? (
                  <span aria-current="page" className="font-medium text-gray-900 dark:text-white">
                    {item.label}
                  </span>
                ) : (
                  <Link
                    href={item.href || '#'}
                    className="hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>

        {/* Mobile breadcrumb — collapsed, visible on < sm screens */}
        <ol className="flex sm:hidden items-center gap-1 text-sm text-gray-500 flex-wrap">
          {visibleItems.map((item, index) => {
            const isLast = item.originalIndex === lastIndex;
            const isCollapsed = item.collapsed;
            return (
              <li key={index} className="flex items-center gap-1">
                {index > 0 && (
                  <span aria-hidden="true" className="select-none text-gray-400">
                    {separator}
                  </span>
                )}
                {isCollapsed ? (
                  <span aria-hidden="true" className="text-gray-400">
                    {item.label}
                  </span>
                ) : isLast ? (
                  <span aria-current="page" className="font-medium text-gray-900 dark:text-white">
                    {item.label}
                  </span>
                ) : (
                  <Link
                    href={item.href || '#'}
                    className="hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
