import { useQuery } from '@tanstack/react-query';
import { systemApi } from '../lib/api';
import { APP_NETWORK, checkNetworkMatch, type NetworkMatch } from '../lib/networkMatch';
import { useWalletStore } from '../store/useWalletStore';

/** Live network-match status for UI (banner, disabled submit buttons). */
export function useNetworkMatch(): NetworkMatch {
  const walletNetwork = useWalletStore((s) => s.walletNetwork);
  const { data: apiNetwork = null } = useQuery({
    queryKey: ['api-network'],
    queryFn: systemApi.apiNetwork,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  return checkNetworkMatch({ walletNetwork, appNetwork: APP_NETWORK, apiNetwork });
}
