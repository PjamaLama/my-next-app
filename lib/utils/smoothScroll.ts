// Smooth scrolling utility for site links navigation
export const smoothScrollToSection = (sectionId: string) => {
  const element = document.getElementById(sectionId);
  if (element) {
    const headerOffset = 80; // Account for fixed header if any
    const elementPosition = element.offsetTop;
    const offsetPosition = elementPosition - headerOffset;

    // Use scrollIntoView for better compatibility
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

  const updateHashOnScroll = () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const sections = ['try-demo', 'demo', 'input-types', 'features', 'pricing', 'process'];
        const scrollPosition = window.scrollY + 150; // Offset for header + more precise detection
        const windowHeight = window.innerHeight;

        // Clear hash when at the very top of the page
        if (scrollPosition < 200) {
          if (window.location.hash !== '') {
            history.replaceState(null, '', window.location.pathname);
          }
          ticking = false;
          return;
        }

        let hashUpdated = false;

        for (const section of sections) {
          const element = document.getElementById(section);
          if (element) {
            const { offsetTop, offsetHeight } = element;
            // Only update hash when section title is near the top of viewport
            const sectionTriggerPoint = offsetTop - 150; // 150px from top

            if (scrollPosition >= sectionTriggerPoint && scrollPosition < offsetTop + offsetHeight - 200) {
              const currentHash = window.location.hash.substring(1);
              if (currentHash !== section) {
                history.replaceState(null, '', `#${section}`);
                hashUpdated = true;
              }
              break;
            }
          }
        }

        // If no section matched and we're not at the top, clear hash
        if (!hashUpdated && scrollPosition > 300 && window.location.hash !== '') {
          const lastSection = document.getElementById('process');
          if (lastSection && scrollPosition > lastSection.offsetTop + lastSection.offsetHeight) {
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
