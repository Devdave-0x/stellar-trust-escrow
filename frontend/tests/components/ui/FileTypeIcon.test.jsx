import { render, screen } from '@testing-library/react';
import FileTypeIcon from '../../../components/ui/FileTypeIcon';

describe('FileTypeIcon', () => {
  describe('MIME type detection', () => {
    it('renders PDF icon for application/pdf MIME type', () => {
      render(<FileTypeIcon mimeType="application/pdf" />);
      const icon = screen.getByTestId('file-type-icon');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveAttribute('data-category', 'pdf');
      expect(icon).toHaveAttribute('aria-label', 'PDF');
      expect(icon).toHaveClass('text-red-400');
    });

    it('renders image icon for image/png MIME type', () => {
      render(<FileTypeIcon mimeType="image/png" />);
      const icon = screen.getByTestId('file-type-icon');
      expect(icon).toHaveAttribute('data-category', 'image');
      expect(icon).toHaveAttribute('aria-label', 'Image');
      expect(icon).toHaveClass('text-green-400');
    });

    it('renders image icon for image/jpeg MIME type', () => {
      render(<FileTypeIcon mimeType="image/jpeg" />);
      const icon = screen.getByTestId('file-type-icon');
      expect(icon).toHaveAttribute('data-category', 'image');
    });

    it('renders video icon for video/mp4 MIME type', () => {
      render(<FileTypeIcon mimeType="video/mp4" />);
      const icon = screen.getByTestId('file-type-icon');
      expect(icon).toHaveAttribute('data-category', 'video');
      expect(icon).toHaveAttribute('aria-label', 'Video');
      expect(icon).toHaveClass('text-purple-400');
    });

    it('renders archive icon for application/zip MIME type', () => {
      render(<FileTypeIcon mimeType="application/zip" />);
      const icon = screen.getByTestId('file-type-icon');
      expect(icon).toHaveAttribute('data-category', 'archive');
      expect(icon).toHaveAttribute('aria-label', 'Archive');
      expect(icon).toHaveClass('text-amber-400');
    });

    it('renders Word icon for application/msword MIME type', () => {
      render(<FileTypeIcon mimeType="application/msword" />);
      const icon = screen.getByTestId('file-type-icon');
      expect(icon).toHaveAttribute('data-category', 'word');
      expect(icon).toHaveAttribute('aria-label', 'Word Document');
      expect(icon).toHaveClass('text-blue-400');
    });

    it('renders Word icon for .docx MIME type', () => {
      render(
        <FileTypeIcon mimeType="application/vnd.openxmlformats-officedocument.wordprocessingml.document" />,
      );
      const icon = screen.getByTestId('file-type-icon');
      expect(icon).toHaveAttribute('data-category', 'word');
    });

    it('renders spreadsheet icon for application/vnd.ms-excel MIME type', () => {
      render(<FileTypeIcon mimeType="application/vnd.ms-excel" />);
      const icon = screen.getByTestId('file-type-icon');
      expect(icon).toHaveAttribute('data-category', 'spreadsheet');
      expect(icon).toHaveAttribute('aria-label', 'Spreadsheet');
      expect(icon).toHaveClass('text-green-400');
    });

    it('renders spreadsheet icon for .xlsx MIME type', () => {
      render(
        <FileTypeIcon mimeType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />,
      );
      const icon = screen.getByTestId('file-type-icon');
      expect(icon).toHaveAttribute('data-category', 'spreadsheet');
    });
  });

  describe('filename extension fallback', () => {
    it('derives PDF icon from .pdf extension when no MIME type', () => {
      render(<FileTypeIcon filename="report.pdf" />);
      const icon = screen.getByTestId('file-type-icon');
      expect(icon).toHaveAttribute('data-category', 'pdf');
    });

    it('derives Word icon from .docx extension when no MIME type', () => {
      render(<FileTypeIcon filename="document.docx" />);
      const icon = screen.getByTestId('file-type-icon');
      expect(icon).toHaveAttribute('data-category', 'word');
    });

    it('derives Word icon from .doc extension', () => {
      render(<FileTypeIcon filename="old.doc" />);
      const icon = screen.getByTestId('file-type-icon');
      expect(icon).toHaveAttribute('data-category', 'word');
    });

    it('derives image icon from .png extension', () => {
      render(<FileTypeIcon filename="photo.png" />);
      const icon = screen.getByTestId('file-type-icon');
      expect(icon).toHaveAttribute('data-category', 'image');
    });

    it('derives video icon from .mp4 extension', () => {
      render(<FileTypeIcon filename="clip.mp4" />);
      const icon = screen.getByTestId('file-type-icon');
      expect(icon).toHaveAttribute('data-category', 'video');
    });

    it('derives archive icon from .zip extension', () => {
      render(<FileTypeIcon filename="bundle.zip" />);
      const icon = screen.getByTestId('file-type-icon');
      expect(icon).toHaveAttribute('data-category', 'archive');
    });

    it('derives spreadsheet icon from .xlsx extension', () => {
      render(<FileTypeIcon filename="data.xlsx" />);
      const icon = screen.getByTestId('file-type-icon');
      expect(icon).toHaveAttribute('data-category', 'spreadsheet');
    });

    it('derives spreadsheet icon from .csv extension', () => {
      render(<FileTypeIcon filename="export.csv" />);
      const icon = screen.getByTestId('file-type-icon');
      expect(icon).toHaveAttribute('data-category', 'spreadsheet');
    });
  });

  describe('unknown type fallback', () => {
    it('renders grey unknown icon for unrecognized MIME type with no filename', () => {
      render(<FileTypeIcon mimeType="application/x-custom" />);
      const icon = screen.getByTestId('file-type-icon');
      expect(icon).toHaveAttribute('data-category', 'unknown');
      expect(icon).toHaveAttribute('aria-label', 'Unknown file type');
      expect(icon).toHaveClass('text-gray-400');
    });

    it('renders grey unknown icon for unrecognized extension', () => {
      render(<FileTypeIcon filename="data.xyz" />);
      const icon = screen.getByTestId('file-type-icon');
      expect(icon).toHaveAttribute('data-category', 'unknown');
      expect(icon).toHaveClass('text-gray-400');
    });

    it('renders grey unknown icon when neither MIME type nor filename is provided', () => {
      render(<FileTypeIcon />);
      const icon = screen.getByTestId('file-type-icon');
      expect(icon).toHaveAttribute('data-category', 'unknown');
      expect(icon).toHaveClass('text-gray-400');
    });
  });

  describe('size prop', () => {
    it('renders at default size (md = 24px) when size is not specified', () => {
      const { container } = render(<FileTypeIcon mimeType="application/pdf" />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('width', '24');
      expect(svg).toHaveAttribute('height', '24');
    });

    it('renders at small size (sm = 16px)', () => {
      const { container } = render(<FileTypeIcon mimeType="application/pdf" size="sm" />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('width', '16');
      expect(svg).toHaveAttribute('height', '16');
    });

    it('renders at large size (lg = 32px)', () => {
      const { container } = render(<FileTypeIcon mimeType="application/pdf" size="lg" />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('width', '32');
      expect(svg).toHaveAttribute('height', '32');
    });
  });

  describe('MIME type takes priority over filename', () => {
    it('uses MIME type when both are provided', () => {
      // MIME says PDF, extension says .docx — MIME wins
      render(<FileTypeIcon mimeType="application/pdf" filename="document.docx" />);
      const icon = screen.getByTestId('file-type-icon');
      expect(icon).toHaveAttribute('data-category', 'pdf');
    });
  });
});
