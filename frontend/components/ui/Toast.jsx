'use client';

import { useEffect } from 'react';

export default function Toast({ message, type = 'success', duration = 4000, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const typeStyles = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-yellow-500',
    info: 'bg-blue-500',
  };

  return (
    <div className={`${typeStyles[type]} text-white px-4 py-2 rounded shadow-lg`}>
      {message}
    </div>
  );
}
