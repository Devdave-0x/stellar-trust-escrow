import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MultiUploader from '../../../components/dispute/MultiUploader';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFile(name = 'evidence.pdf', type = 'application/pdf', sizeBytes = 1024) {
  const file = new File([new Uint8Array(Math.min(sizeBytes, 1024))], name, { type });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

function dropFiles(dropZone, files) {
  fireEvent.dragOver(dropZone, { dataTransfer: { files } });
  fireEvent.drop(dropZone, { dataTransfer: { files } });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MultiUploader', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('renders the drop zone', () => {
    render(<MultiUploader />);
    expect(screen.getByRole('button', { name: /drop files here/i })).toBeInTheDocument();
  });

  it('accepts files via input change', async () => {
    render(<MultiUploader />);
    const input = document.querySelector('input[type="file"]');
    const file = makeFile();
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    expect(screen.getByText('evidence.pdf')).toBeInTheDocument();
  });

  it('accepts files via drag-and-drop', async () => {
    render(<MultiUploader />);
    const zone = screen.getByRole('button', { name: /drop files here/i });
    const file = makeFile('report.pdf');
    await act(async () => {
      dropFiles(zone, [file]);
    });
    expect(screen.getByText('report.pdf')).toBeInTheDocument();
  });

  it('shows uploading spinner then done checkmark', async () => {
    render(<MultiUploader />);
    const input = document.querySelector('input[type="file"]');
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } });
    });
    // Spinner visible while uploading
    expect(screen.getByLabelText('Uploading')).toBeInTheDocument();

    // Advance timers step by step until upload completes (avoids infinite-loop with Math.random)
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    await waitFor(() => expect(screen.getByLabelText('Upload complete')).toBeInTheDocument());
  });

  it('rejects unsupported file types', async () => {
    render(<MultiUploader />);
    const input = document.querySelector('input[type="file"]');
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile('video.mp4', 'video/mp4')] } });
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/type not allowed/i);
  });

  it('rejects files exceeding 10 MB', async () => {
    render(<MultiUploader />);
    const input = document.querySelector('input[type="file"]');
    const bigFile = makeFile('big.pdf', 'application/pdf', 11 * 1024 * 1024);
    await act(async () => {
      fireEvent.change(input, { target: { files: [bigFile] } });
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/exceeds 10 mb/i);
  });

  it('removes a file when remove button is clicked', async () => {
    render(<MultiUploader />);
    const input = document.querySelector('input[type="file"]');
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile('doc.pdf')] } });
    });
    // Complete upload so remove button appears
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    await waitFor(() => screen.getByLabelText('Remove doc.pdf'));
    fireEvent.click(screen.getByLabelText('Remove doc.pdf'));
    expect(screen.queryByText('doc.pdf')).not.toBeInTheDocument();
  });

  it('cancels an in-progress upload', async () => {
    render(<MultiUploader />);
    const input = document.querySelector('input[type="file"]');
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile('cancel.pdf')] } });
    });
    const cancelBtn = screen.getByLabelText('Cancel upload for cancel.pdf');
    fireEvent.click(cancelBtn);
    await waitFor(() => expect(screen.getByLabelText('cancelled')).toBeInTheDocument());
  });

  it('allows caption input after upload completes', async () => {
    render(<MultiUploader />);
    const input = document.querySelector('input[type="file"]');
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile('proof.pdf')] } });
    });
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    const captionInput = await screen.findByLabelText('Caption for proof.pdf');
    fireEvent.change(captionInput, { target: { value: 'Key evidence' } });
    expect(captionInput).toHaveValue('Key evidence');
  });

  it('calls onUpload with accepted files', async () => {
    const onUpload = jest.fn();
    render(<MultiUploader onUpload={onUpload} />);
    const input = document.querySelector('input[type="file"]');
    const file = makeFile();
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    expect(onUpload).toHaveBeenCalledWith([file]);
  });

  it('disables drop zone when maxFiles is reached', async () => {
    render(<MultiUploader maxFiles={1} />);
    const input = document.querySelector('input[type="file"]');
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } });
    });
    // The zone is a real <button>, so the limit is expressed with the native
    // disabled state rather than aria-disabled.
    const zone = screen.getByRole('button', { name: /file limit reached/i });
    expect(zone).toBeDisabled();
  });

  it('shows total size exceeded warning', async () => {
    render(<MultiUploader maxTotalMB={0.001} />);
    const input = document.querySelector('input[type="file"]');
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile('a.pdf', 'application/pdf', 2048)] } });
    });
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(alerts.some((el) => /exceeds.*mb limit/i.test(el.textContent))).toBe(true);
    });
  });

  it('drop zone changes label text while dragging', () => {
    render(<MultiUploader />);
    const zone = screen.getByRole('button', { name: /drop files here/i });
    fireEvent.dragOver(zone, { dataTransfer: { files: [] } });
    expect(screen.getByText('Release to add files')).toBeInTheDocument();
  });

  // ── Accessibility ──────────────────────────────────────────────────────────

  it('exposes the drop zone as a native button, not a div with role=button', () => {
    render(<MultiUploader />);
    const zone = screen.getByRole('button', { name: /drop files here/i });
    expect(zone.tagName).toBe('BUTTON');
    expect(zone).toHaveAttribute('type', 'button');
  });

  it('keeps the file input outside the drop-zone button', () => {
    // A focusable input nested inside a button is a nested-interactive
    // violation (WCAG 4.1.2).
    render(<MultiUploader />);
    const zone = screen.getByRole('button', { name: /drop files here/i });
    const input = document.querySelector('input[type="file"]');
    expect(zone.contains(input)).toBe(false);
  });

  it('reaches the drop zone by keyboard and opens the picker on activation', async () => {
    jest.useRealTimers();
    const user = userEvent.setup();
    render(<MultiUploader />);

    const zone = screen.getByRole('button', { name: /drop files here/i });
    const input = document.querySelector('input[type="file"]');
    const clickSpy = jest.spyOn(input, 'click').mockImplementation(() => {});

    await user.tab();
    expect(zone).toHaveFocus();

    // A native button activates on both Enter and Space.
    await user.keyboard('{Enter}');
    expect(clickSpy).toHaveBeenCalledTimes(1);

    await user.keyboard(' ');
    expect(clickSpy).toHaveBeenCalledTimes(2);
  });

  it('labels each per-file progress bar', async () => {
    render(<MultiUploader />);
    const input = document.querySelector('input[type="file"]');
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile('claim.pdf')] } });
    });

    expect(
      screen.getByRole('progressbar', { name: 'Upload progress for claim.pdf' }),
    ).toBeInTheDocument();
  });

  it('reorders the queue from the keyboard as well as by dragging', async () => {
    render(<MultiUploader />);
    const input = document.querySelector('input[type="file"]');
    await act(async () => {
      fireEvent.change(input, {
        target: { files: [makeFile('first.pdf'), makeFile('second.pdf')] },
      });
    });

    const names = () => screen.getAllByTitle(/\.pdf$/).map((el) => el.textContent);

    expect(names()).toEqual(['first.pdf', 'second.pdf']);

    fireEvent.click(screen.getByLabelText('Move second.pdf up'));

    expect(names()).toEqual(['second.pdf', 'first.pdf']);
  });

  it('disables the move controls at the ends of the queue', async () => {
    render(<MultiUploader />);
    const input = document.querySelector('input[type="file"]');
    await act(async () => {
      fireEvent.change(input, {
        target: { files: [makeFile('a.pdf'), makeFile('b.pdf')] },
      });
    });

    expect(screen.getByLabelText('Move a.pdf up')).toBeDisabled();
    expect(screen.getByLabelText('Move b.pdf down')).toBeDisabled();
    expect(screen.getByLabelText('Move a.pdf down')).toBeEnabled();
  });
});
