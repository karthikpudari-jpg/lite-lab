const PATHS = {
  billing: 'M4 4h16v4H4zM4 10h16v10H4zM8 14h8M8 17h5',
  orders: 'M6 2h9l3 3v17H6zM15 2v3h3M9 12h6M9 16h6M9 8h3',
  lab: 'M9 3h6M10 3v6.5L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9.5V3M7.5 15h9',
  reports: 'M4 20V10M10 20V4M16 20v-7M3 20h18',
  masters: 'M12 2l1.5 3 3.3.5-2.4 2.3.6 3.3L12 9.5 8.9 11.1l.6-3.3-2.4-2.3 3.3-.5zM12 15v7M8 22h8',
  tickets: 'M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z',
  branding: 'M4 5h16v12H4zM4 17l4-5 3 3 4-6 5 8M9 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 7v5l3 3',
  calendar: 'M7 2v3M17 2v3M3.5 9h17M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  building: 'M4 21V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v16M14 21V9a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v12M8 9h0M8 13h0M8 17h0',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 6l12 12M18 6L6 18',
  invoice: 'M6 2h12a1 1 0 0 1 1 1v18l-3-2-2 2-2-2-2 2-2-2-3 2V3a1 1 0 0 1 1-1zM8 7h8M8 11h8M8 15h5',
};

export function Icon({ name, size = 20, ...rest }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <path d={d} />
    </svg>
  );
}
