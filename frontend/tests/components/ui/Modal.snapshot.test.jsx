import { render } from '@testing-library/react';
import Modal from '../../../components/ui/Modal';

describe('Modal snapshots', () => {
  it('renders nothing when closed (default props)', () => {
    const { container } = render(
      <Modal isOpen={false} onClose={() => {}}>
        Content
      </Modal>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders open with a title', () => {
    const { container } = render(
      <Modal isOpen onClose={() => {}} title="Confirm action">
        Content
      </Modal>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it.each(['sm', 'md', 'lg'])('renders the %s size', (size) => {
    const { container } = render(
      <Modal isOpen onClose={() => {}} title="Sized modal" size={size}>
        Content
      </Modal>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders the confirmation footer variant', () => {
    const { container } = render(
      <Modal
        isOpen
        onClose={() => {}}
        title="Are you sure?"
        isConfirmation
        onConfirm={() => {}}
        confirmVariant="danger"
      >
        This cannot be undone.
      </Modal>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
