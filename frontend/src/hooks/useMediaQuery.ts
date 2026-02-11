import { useState, useEffect } from 'react';

export function useMediaQuery(): { isMobile: boolean; isSmallMobile: boolean } {
  const [state, setState] = useState(() => ({
    isMobile: typeof window !== 'undefined' && window.innerWidth <= 768,
    isSmallMobile: typeof window !== 'undefined' && window.innerWidth <= 480,
  }));

  useEffect(() => {
    const mq768 = window.matchMedia('(max-width: 768px)');
    const mq480 = window.matchMedia('(max-width: 480px)');

    function update() {
      setState({
        isMobile: mq768.matches,
        isSmallMobile: mq480.matches,
      });
    }

    update();
    mq768.addEventListener('change', update);
    mq480.addEventListener('change', update);
    return () => {
      mq768.removeEventListener('change', update);
      mq480.removeEventListener('change', update);
    };
  }, []);

  return state;
}
