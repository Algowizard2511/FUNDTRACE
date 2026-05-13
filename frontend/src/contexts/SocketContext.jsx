import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [liveTransactions, setLiveTransactions] = useState([]);
  const [liveAlerts, setLiveAlerts] = useState([]);
  const listenersRef = useRef({});

  useEffect(() => {
    const s = io('http://localhost:5000', {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    s.on('connect', () => { setConnected(true); console.log('🔌 Socket connected'); });
    s.on('disconnect', () => { setConnected(false); console.log('🔌 Socket disconnected'); });

    s.on('new_transaction', (tx) => {
      setLiveTransactions(prev => [tx, ...prev.slice(0, 99)]);
      listenersRef.current['new_transaction']?.forEach(fn => fn(tx));
    });

    s.on('transaction_flagged', (tx) => {
      setLiveTransactions(prev => prev.map(t => t.tx_id === tx.tx_id ? tx : t));
      listenersRef.current['transaction_flagged']?.forEach(fn => fn(tx));
    });

    s.on('new_alert', (alert) => {
      setLiveAlerts(prev => [alert, ...prev.slice(0, 49)]);
      listenersRef.current['new_alert']?.forEach(fn => fn(alert));
    });

    setSocket(s);
    return () => s.disconnect();
  }, []);

  const on = (event, fn) => {
    if (!listenersRef.current[event]) listenersRef.current[event] = new Set();
    listenersRef.current[event].add(fn);
    return () => listenersRef.current[event]?.delete(fn);
  };

  const emit = (event, data) => socket?.emit(event, data);

  return (
    <SocketContext.Provider value={{ socket, connected, liveTransactions, liveAlerts, on, emit }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
