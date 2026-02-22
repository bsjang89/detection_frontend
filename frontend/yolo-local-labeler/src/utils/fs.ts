export type PickedImage = {
  name: string;
  handle: FileSystemFileHandle;
  file: File;
  url: string;
};

const IMG_EXT = [".jpg", ".jpeg", ".png", ".bmp", ".webp"];

function isImage(name: string) {
  const lower = name.toLowerCase();
  return IMG_EXT.some((e) => lower.endsWith(e));
}

export async function pickFolderImages(): Promise<{
  dirHandle: FileSystemDirectoryHandle;
  images: PickedImage[];
}> {
  // File System Access API (Chrome/Edge)
  // @ts-ignore
  const dirHandle: FileSystemDirectoryHandle = await window.showDirectoryPicker();

  const images: PickedImage[] = [];
  for await (const [name, handle] of (dirHandle as any).entries()) {
    if (handle.kind === "file" && isImage(name)) {
      const fileHandle = handle as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      const url = URL.createObjectURL(file);
      images.push({ name, handle: fileHandle, file, url });
    }
  }

  images.sort((a, b) => a.name.localeCompare(b.name));
  return { dirHandle, images };
}

export async function ensureSubDir(
  dirHandle: FileSystemDirectoryHandle,
  subDirName: string
) {
  return await dirHandle.getDirectoryHandle(subDirName, { create: true });
}

export async function writeTextFile(
  dirHandle: FileSystemDirectoryHandle,
  filename: string,
  content: string
) {
  const fh = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fh.createWritable();
  await writable.write(content);
  await writable.close();
}
