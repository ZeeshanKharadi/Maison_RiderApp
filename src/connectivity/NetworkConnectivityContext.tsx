import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

type NetworkConnectivityValue = {
  /** Phone has a usable network path (not airplane / no radios). */
  isConnected: boolean;
  /** True until the first NetInfo snapshot arrives. */
  connectivityReady: boolean;
};

const NetworkConnectivityContext =
  createContext<NetworkConnectivityValue | null>(null);

function connectedFromState(state: NetInfoState | null): boolean {
  if (!state) return true;
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

export function NetworkConnectivityProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isConnected, setIsConnected] = useState(true);
  const [connectivityReady, setConnectivityReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    void NetInfo.fetch().then(state => {
      if (!mounted) return;
      setIsConnected(connectedFromState(state));
      setConnectivityReady(true);
    });
    const unsub = NetInfo.addEventListener(state => {
      setIsConnected(connectedFromState(state));
      setConnectivityReady(true);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const value = useMemo(
    () => ({ isConnected, connectivityReady }),
    [isConnected, connectivityReady],
  );

  return (
    <NetworkConnectivityContext.Provider value={value}>
      {children}
    </NetworkConnectivityContext.Provider>
  );
}

export function useNetworkConnectivity(): NetworkConnectivityValue {
  const ctx = useContext(NetworkConnectivityContext);
  if (!ctx) {
    throw new Error(
      'useNetworkConnectivity must be used within NetworkConnectivityProvider',
    );
  }
  return ctx;
}
