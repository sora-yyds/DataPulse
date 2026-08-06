/**
 * M0-029：`.xlsx`（ZIP 容器）的只读中央目录检查。
 *
 * 只读取 EOCD 与中央目录条目（entry 数量、flags、压缩/解压大小），不解析
 * 局部文件头、不执行解压，因此不触碰公式/宏/链接。加密条目与结构损坏返回
 * 封闭的 IMPORT_ARCHIVE_INVALID 错误；32 位偏移对 ≤50 MiB 文件足够，无需 ZIP64。
 */
import type { Result } from "@datapulse/domain";

import { createArchiveInvalidError, type ImportError } from "./errors.js";

export type XlsxArchiveInspection = Readonly<{
  entryCount: number;
  compressedBytes: number;
  decompressedBytes: number;
  compressionRatio: number;
}>;

export type XlsxArchiveInspectionResult = Result<
  XlsxArchiveInspection,
  ImportError
>;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const EOCD_MIN_LENGTH = 22;
const CENTRAL_DIRECTORY_ENTRY_HEADER_LENGTH = 46;
const MAX_EOCD_SEARCH_BYTES = 65_557;
const ENCRYPTED_ENTRY_FLAG = 0x0001;

function success(value: XlsxArchiveInspection): XlsxArchiveInspectionResult {
  return Object.freeze({ ok: true, value });
}

function failure(error: ImportError): XlsxArchiveInspectionResult {
  return Object.freeze({ ok: false, error });
}

/** 从文件尾部向前查找经典 EOCD 签名（注释区 ≤65,535 字节）。 */
function findEndOfCentralDirectory(
  bytes: Uint8Array,
  view: DataView,
): number | null {
  const searchStart = Math.max(0, bytes.byteLength - MAX_EOCD_SEARCH_BYTES);
  for (let offset = bytes.byteLength - EOCD_MIN_LENGTH; offset >= searchStart; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  return null;
}

/** 检查 ZIP 容器结构并统计条目数量与压缩/解压字节。 */
export function inspectXlsxArchive(bytes: Uint8Array): XlsxArchiveInspectionResult {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(bytes, view);
  if (eocdOffset === null) {
    return failure(createArchiveInvalidError("missing-eocd"));
  }
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirectorySize = view.getUint32(eocdOffset + 12, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  if (
    centralDirectoryOffset > bytes.byteLength ||
    centralDirectorySize > bytes.byteLength - centralDirectoryOffset
  ) {
    return failure(createArchiveInvalidError("truncated-central-directory"));
  }

  let offset = centralDirectoryOffset;
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  let compressedBytes = 0;
  let decompressedBytes = 0;
  let entryCount = 0;

  while (offset < centralDirectoryEnd) {
    if (offset + CENTRAL_DIRECTORY_ENTRY_HEADER_LENGTH > centralDirectoryEnd) {
      return failure(createArchiveInvalidError("truncated-central-directory"));
    }
    if (view.getUint32(offset, true) !== CENTRAL_DIRECTORY_SIGNATURE) {
      return failure(createArchiveInvalidError("truncated-central-directory"));
    }
    const flags = view.getUint16(offset + 8, true);
    if ((flags & ENCRYPTED_ENTRY_FLAG) !== 0) {
      return failure(createArchiveInvalidError("encrypted-entry"));
    }
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const entryLength =
      CENTRAL_DIRECTORY_ENTRY_HEADER_LENGTH + nameLength + extraLength + commentLength;
    if (offset + entryLength > centralDirectoryEnd) {
      return failure(createArchiveInvalidError("truncated-central-directory"));
    }
    compressedBytes += compressedSize;
    decompressedBytes += uncompressedSize;
    entryCount += 1;
    offset += entryLength;
  }

  if (entryCount !== totalEntries) {
    return failure(createArchiveInvalidError("truncated-central-directory"));
  }

  const compressionRatio =
    compressedBytes === 0 ? 0 : decompressedBytes / compressedBytes;
  return success({
    entryCount,
    compressedBytes,
    decompressedBytes,
    compressionRatio,
  });
}