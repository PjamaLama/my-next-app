// Utility for managing demo input state across sign-in flow
interface DemoInputData {
  type: 'text' | 'file' | 'voice';
  content: string;
  fileName?: string;
  fileType?: string;
  timestamp: number;
  results?: any; // Store the demo results too
}

export class DemoInputManager {
  private static readonly STORAGE_KEY = 'demoInput';

  static saveDemoInput(data: DemoInputData): void {
    try {
      sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save demo input to sessionStorage:', error);
    }
  }

  static getDemoInput(): DemoInputData | null {
    try {
      const stored = sessionStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.warn('Failed to retrieve demo input from sessionStorage:', error);
      return null;
    }
  }

  static clearDemoInput(): void {
    try {
      sessionStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.warn('Failed to clear demo input from sessionStorage:', error);
    }
  }

  static hasRecentDemoInput(maxAgeMinutes: number = 30): boolean {
    const demoInput = this.getDemoInput();
    if (!demoInput) return false;

    const ageMinutes = (Date.now() - demoInput.timestamp) / (1000 * 60);
    return ageMinutes <= maxAgeMinutes;
  }

  static shouldShowOnboardingModal(): boolean {
    return this.hasRecentDemoInput(30); // 30 minutes window
  }
}
