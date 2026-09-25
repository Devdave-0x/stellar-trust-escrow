import { render, screen } from '@testing-library/react';
import RelayerBalanceStatus, { getRelayerBalanceState } from '../../../components/admin/RelayerBalanceStatus';

describe('RelayerBalanceStatus', () => {
  it('classifies normal, warning, and critical balances', () => {
    expect(getRelayerBalanceState({ status: 'active', balanceXlm: 20 })).toBe('normal');
    expect(getRelayerBalanceState({ status: 'active', balanceXlm: 5 })).toBe('warning');
    expect(getRelayerBalanceState({ status: 'active', balanceXlm: 1 })).toBe('critical');
  });

  it('renders a refreshable status without secret material', () => {
    render(<RelayerBalanceStatus data={{ status: 'active', balanceXlm: 20, relayerAddress: 'GABC123456789' }} onRefresh={() => {}} />);
    expect(screen.getByText('Normal')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(screen.queryByText(/secret|private/i)).not.toBeInTheDocument();
  });
});
