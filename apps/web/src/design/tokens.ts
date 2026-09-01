export const CINEMA_TOKENS = {
  card: {
    sharpPoster:
      'relative w-full aspect-[2/3] rounded-sm overflow-hidden transition-all duration-300 ease-out border',
    focusedCard:
      'scale-[1.04] z-10 border-white bg-[#0a0e1a] shadow-[0_15px_35px_rgba(255,255,255,0.25)] ring-1 ring-white',
    normalCard: 'border-zinc-800 bg-[#060913]',
  },
  dropdown: {
    button:
      'flex items-center justify-between gap-2 bg-black hover:bg-zinc-900 text-white rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all shadow-lg cursor-pointer border border-white/20 hover:border-white',
    menu: 'absolute end-0 top-full mt-2 bg-black/98 text-white rounded-lg shadow-[0_16px_40px_rgba(0,0,0,0.95)] min-w-[150px] max-h-64 overflow-y-auto z-50 flex flex-col py-1.5 border border-white/20 backdrop-blur-2xl',
    activeItem: 'text-black bg-white font-extrabold shadow-sm',
    item: 'w-full px-4 py-2 text-xs font-bold transition-all border-0 cursor-pointer text-zinc-300 hover:text-white hover:bg-zinc-900 text-start',
  },
} as const;
