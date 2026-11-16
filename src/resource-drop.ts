export function resourceDropTarget(
  panel: HTMLElement,
  { canLoad, onFile }: { canLoad: () => boolean; onFile: (file: File) => void },
) {
  let depth = 0;
  const reset = () => {
    depth = 0;
    delete panel.dataset.dragging;
  };
  const files = (event: DragEvent) =>
    event.dataTransfer?.types.includes('Files');
  panel.addEventListener('dragenter', (event) => {
    if (!canLoad() || !files(event)) {
      return;
    }
    event.preventDefault();
    depth++;
    panel.dataset.dragging = 'true';
  });
  panel.addEventListener('dragover', (event) => {
    if (!files(event) || !event.dataTransfer) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = canLoad() ? 'copy' : 'none';
    if (canLoad()) {
      panel.dataset.dragging = 'true';
    } else {
      reset();
    }
  });
  panel.addEventListener('dragleave', () => {
    if (depth > 0 && --depth === 0) {
      reset();
    }
  });
  panel.addEventListener('dragend', reset);
  panel.addEventListener('drop', (event) => {
    reset();
    if (!event.dataTransfer?.files.length) {
      return;
    }
    event.preventDefault();
    if (canLoad()) {
      onFile(event.dataTransfer.files[0]);
    }
  });
  return reset;
}
