// Smooth scrolling utility for site links navigation
export const smoothScrollToSection = (sectionId: string) => {
  const element = document.getElementById(sectionId);
  if (element) {
    // Use scrollIntoView for better compatibility - avoids forced reflow
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
      inline: 'nearest'
    });

    // Update URL hash after a small delay to ensure scroll is complete
    setTimeout(() => {
      const currentHash = window.location.hash.substring(1);
      if (currentHash !== sectionId) {
        history.pushState(null, '', `#${sectionId}`);
        console.log('URL updated to:', `#${sectionId}`); // Debug log
      }
    }, 300);
  } else {
    console.warn('Element not found:', sectionId);
  }
};

export const handleHashNavigation = () => {
  // Handle initial load with hash
  const hash = window.location.hash.substring(1);
  if (hash) {
    // Small delay to ensure page is fully loaded
    setTimeout(() => {
      smoothScrollToSection(hash);
    }, 100);
  }
};

// Handle browser back/forward navigation
export const setupHashNavigation = () => {
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.substring(1);
    if (hash) {
      smoothScrollToSection(hash);
    }
  });
};

// Auto-update URL hash when scrolling to sections (optional enhancement)
export const setupScrollBasedHashUpdate = () => {
  let ticking = false;
  // Cache element positions to avoid forced reflow on every scroll
  let cachedPositions: { [key: string]: { top: number; height: number } } | null = null;
  let cacheTime = 0;

  const getCachedPositions = () => {
    const now = Date.now();
    // Cache positions for 100ms to avoid excessive recalculations
    if (!cachedPositions || now - cacheTime > 100) {
      cachedPositions = {};
      const sections = ['try-demo', 'demo', 'input-types', 'features', 'pricing', 'process'];
      sections.forEach(section => {
        const element = document.getElementById(section);
        if (element) {
          cachedPositions[section] = {
            top: element.offsetTop,
            height: element.offsetHeight
          };
        }
      });
      cacheTime = now;
    }
    return cachedPositions;
  };

  const updateHashOnScroll = () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const scrollPosition = window.scrollY + 150; // Offset for header + more precise detection
        const positions = getCachedPositions();

        // Clear hash when at the very top of the page
        if (scrollPosition < 200) {
          if (window.location.hash !== '') {
            history.replaceState(null, '', window.location.pathname);
          }
          ticking = false;
          return;
        }

        let hashUpdated = false;

        for (const section in positions) {
          const pos = positions[section];
          // Only update hash when section title is near the top of viewport
          const sectionTriggerPoint = pos.top - 150; // 150px from top

          if (scrollPosition >= sectionTriggerPoint && scrollPosition < pos.top + pos.height - 200) {
            const currentHash = window.location.hash.substring(1);
            if (currentHash !== section) {
              history.replaceState(null, '', `#${section}`);
              hashUpdated = true;
            }
            break;
          }
        }

        // If no section matched and we're not at the top, clear hash
        if (!hashUpdated && scrollPosition > 300 && window.location.hash !== '') {
          const lastSectionPos = positions['process'];
          if (lastSectionPos && scrollPosition > lastSectionPos.top + lastSectionPos.height) {
            history.replaceState(null, '', window.location.pathname);
          }
        }

        ticking = false;
      });
      ticking = true;
    }
  };

  window.addEventListener('scroll', updateHashOnScroll, { passive: true });
};
