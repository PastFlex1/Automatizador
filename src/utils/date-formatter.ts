/**
 * Formats a message or activity timestamp consistently in the user's local timezone.
 * Handles ISO strings, Date objects, Unix timestamps (seconds or ms), and relative dates.
 */
export function formatMessageTime(dateInput?: string | Date | number | null): string {
  if (!dateInput) {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  try {
    let date: Date;

    if (typeof dateInput === 'number') {
      // If unix seconds (10 digits), convert to ms
      date = dateInput < 1e11 ? new Date(dateInput * 1000) : new Date(dateInput);
    } else if (typeof dateInput === 'string') {
      // Check if it's already a simple time string like "14:30" or "9:24 am"
      if (/^\d{1,2}:\d{2}(\s?[ap]\.?m\.?)?$/i.test(dateInput.trim())) {
        return dateInput.trim();
      }
      date = new Date(dateInput);
    } else {
      date = dateInput;
    }

    if (isNaN(date.getTime())) {
      return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

/**
 * Formats relative timestamp for conversation previews (e.g. "10:45", "Ayer", "12 sep")
 */
export function formatConversationTime(dateInput?: string | Date | number | null): string {
  if (!dateInput) return 'Reciente';

  try {
    let date: Date;
    if (typeof dateInput === 'number') {
      date = dateInput < 1e11 ? new Date(dateInput * 1000) : new Date(dateInput);
    } else if (typeof dateInput === 'string') {
      if (dateInput === 'Justo ahora' || dateInput === 'Reciente' || dateInput === 'Ayer') {
        return dateInput;
      }
      date = new Date(dateInput);
    } else {
      date = dateInput;
    }

    if (isNaN(date.getTime())) return 'Reciente';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Justo ahora';
    if (diffMins < 60) return `Hace ${diffMins} min`;

    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    if (isYesterday) return 'Ayer';

    return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
  } catch {
    return 'Reciente';
  }
}
