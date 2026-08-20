/**
 * @lo/image-resource-manager 类型声明（宿主集成参考）
 *
 * 渲染端独立包：Image Resource Manager UI + 数据访问 + 采集纯逻辑。
 * React 为 peer（宿主提供）；loCore 门面由宿主注入。
 */

/** 采集归一后的图片输入（paste / drop / file-select 三入口统一） */
export interface CollectedImage {
  bytes: Uint8Array;
  mime: string;
  filename: string;
  alt: string;
  source: 'paste' | 'drop' | 'file-select';
}

/** Image Resource 最小形状（loCore listNotes data 条目） */
export interface ImageResource {
  rid: string;
  name?: string;
  type?: string;
  metadata?: { mimetype?: string; size?: number };
  location?: { value?: string };
}

/** loCore（preload 门面）中本包消费的方法白名单（宿主实现） */
export interface LoCoreImageFacade {
  listNotes(opts: { type: string; limit: number }): Promise<{ ok: boolean; data?: ImageResource[]; message?: string }>;
  importResource(opts: {
    buffer: Uint8Array;
    filename: string;
    metadata: { mimetype: string };
    type: 'image';
  }): Promise<{ ok: boolean; data?: ImageResource; message?: string }>;
  getResourceBinary(rid: string): Promise<{ ok: boolean; data?: { mime: string; buffer: string; size: number }; message?: string }>;
  removeNote(rid: string): Promise<{ ok: boolean; message?: string }>;
}

/** ImageManager 数据访问对象（createImageApi 返回值） */
export interface ImageApi {
  list(): Promise<ImageResource[]>;
  importImage(img: { bytes: Uint8Array; mime: string; filename: string }): Promise<ImageResource>;
  getBinary(rid: string): Promise<{ mime: string; buffer: string; size: number }>;
  remove(rid: string): Promise<{ ok: boolean }>;
}

export function createImageApi(getLoCore?: () => LoCoreImageFacade | null): ImageApi;

export function collectImageFiles(files: ArrayLike<File | null>, source: 'paste' | 'drop' | 'file-select'): Promise<CollectedImage[]>;

export const SUPPORTED_MIMES: Set<string>;
export function mimeExt(mime: string): string;
export function base64ToUint8(b64: string): Uint8Array | null;
export function formatSize(bytes: number): string;
export function altFromFilename(filename: string): string;

/** ImageManager props */
export interface ImageManagerProps {
  /** 插入回调：(rid, alt, filename) 三位置参数（与 NoteEditor.insertImage 契约一致） */
  onInsert?: (rid: string, alt?: string, filename?: string) => void;
  /** 可注入 api（单测/宿主自定义）；默认 createImageApi() */
  api?: ImageApi | null;
}

export function ImageManager(props: ImageManagerProps): JSX.Element;

/** ImagePreviewModal props */
export interface ImagePreviewModalProps {
  image: ImageResource & { api?: ImageApi | null };
  onClose: () => void;
}

export function ImagePreviewModal(props: ImagePreviewModalProps): JSX.Element | null;