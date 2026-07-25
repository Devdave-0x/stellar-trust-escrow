import { render, screen, fireEvent } from '@testing-library/react';
import Accordion from '../../../components/ui/Accordion';

const items = [
  { question: 'What is escrow?', answer: 'A neutral third-party holds funds until conditions are met.' },
  { question: 'How do milestones work?', answer: 'Funds are released incrementally per milestone approval.' },
  { question: 'What triggers a dispute?', answer: 'Either party can raise a dispute at any time.' },
];

describe('Accordion', () => {
  it('renders all questions', () => {
    render(<Accordion items={items} />);
    items.forEach(({ question }) => expect(screen.getByText(question)).toBeInTheDocument());
  });

  it('all panels are collapsed on mount', () => {
    render(<Accordion items={items} />);
    items.forEach((_, i) => {
      expect(screen.getAllByRole('button')[i]).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('opens an item when clicked', () => {
    render(<Accordion items={items} />);
    fireEvent.click(screen.getByText(items[0].question));
    expect(screen.getAllByRole('button')[0]).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(items[0].answer)).toBeInTheDocument();
  });

  it('closes an open item when clicked again', () => {
    render(<Accordion items={items} />);
    const btn = screen.getAllByRole('button')[0];
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  it('single-expand: opening one item closes the previously open item', () => {
    render(<Accordion items={items} />);
    const [btn0, btn1] = screen.getAllByRole('button');
    fireEvent.click(btn0);
    expect(btn0).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(btn1);
    expect(btn1).toHaveAttribute('aria-expanded', 'true');
    expect(btn0).toHaveAttribute('aria-expanded', 'false');
  });

  describe('ARIA attributes', () => {
    it('trigger has aria-expanded and aria-controls', () => {
      render(<Accordion items={items} />);
      const btn = screen.getAllByRole('button')[0];
      expect(btn).toHaveAttribute('aria-expanded');
      expect(btn).toHaveAttribute('aria-controls');
    });

    it('panel has role="region" and aria-labelledby pointing to trigger', () => {
      render(<Accordion items={items} />);
      const panels = screen.getAllByRole('region');
      expect(panels).toHaveLength(items.length);

      const btn = screen.getAllByRole('button')[0];
      const panel = document.getElementById(btn.getAttribute('aria-controls'));
      expect(panel).toHaveAttribute('role', 'region');
      expect(panel).toHaveAttribute('aria-labelledby', btn.id);
    });
  });

  describe('keyboard navigation', () => {
    it('ArrowDown moves focus to the next item', () => {
      render(<Accordion items={items} />);
      const [btn0, btn1] = screen.getAllByRole('button');
      btn0.focus();
      fireEvent.keyDown(btn0, { key: 'ArrowDown' });
      expect(document.activeElement).toBe(btn1);
    });

    it('ArrowUp moves focus to the previous item', () => {
      render(<Accordion items={items} />);
      const [btn0, btn1] = screen.getAllByRole('button');
      btn1.focus();
      fireEvent.keyDown(btn1, { key: 'ArrowUp' });
      expect(document.activeElement).toBe(btn0);
    });

    it('ArrowDown wraps from last to first', () => {
      render(<Accordion items={items} />);
      const btns = screen.getAllByRole('button');
      const last = btns[btns.length - 1];
      last.focus();
      fireEvent.keyDown(last, { key: 'ArrowDown' });
      expect(document.activeElement).toBe(btns[0]);
    });

    it('ArrowUp wraps from first to last', () => {
      render(<Accordion items={items} />);
      const btns = screen.getAllByRole('button');
      btns[0].focus();
      fireEvent.keyDown(btns[0], { key: 'ArrowUp' });
      expect(document.activeElement).toBe(btns[btns.length - 1]);
    });

    it('Enter toggles the focused item', () => {
      render(<Accordion items={items} />);
      const btn = screen.getAllByRole('button')[0];
      btn.focus();
      fireEvent.keyDown(btn, { key: 'Enter' });
      expect(btn).toHaveAttribute('aria-expanded', 'true');
      fireEvent.keyDown(btn, { key: 'Enter' });
      expect(btn).toHaveAttribute('aria-expanded', 'false');
    });

    it('Space toggles the focused item', () => {
      render(<Accordion items={items} />);
      const btn = screen.getAllByRole('button')[0];
      btn.focus();
      fireEvent.keyDown(btn, { key: ' ' });
      expect(btn).toHaveAttribute('aria-expanded', 'true');
    });
  });
});
