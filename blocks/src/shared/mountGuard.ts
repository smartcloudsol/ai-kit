import "jquery";

const mounting = new Set<string>();

export function beginMount(id: string, el: Element): boolean {
  if (!id || mounting.has(id) || jQuery(el).data("rendered")) {
    return false;
  }

  mounting.add(id);
  jQuery(el).data("rendered", "true");
  return true;
}

export function endMount(id: string): void {
  mounting.delete(id);
}

export function resetMount(el: Element): void {
  jQuery(el).removeData("rendered");
}
