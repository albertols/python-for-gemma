import { pipeline, Readable, Transform } from "node:stream";
import busboy from "busboy";
import { ApiError } from "../errors.ts";
import type { MaterialStore, SavedMaterial } from "./store.ts";

/** Room for the form's own framing around a file of the largest size. */
const FRAMING_BYTES = 1024 * 1024;

const badUpload = (message: string) => new ApiError(422, "bad-upload", message);

/**
 * Reads one file from a multipart form while it arrives and gives it to the
 * store, which writes it to disk and checks it. Nothing is buffered here: a body
 * that grows past the limit is cut off, and the rest is never read.
 */
export function receiveUpload(
  request: Request,
  store: MaterialStore,
): Promise<SavedMaterial> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType) || !request.body)
    return Promise.reject(badUpload("Choose one file to attach."));
  const body = request.body;
  return new Promise((resolve, reject) => {
    let settled = false;
    let saving: Promise<SavedMaterial> | null = null;
    let files = 0;
    const source = Readable.fromWeb(body as never);
    /** Fails the upload once the half-written file, or one finished for a form that turned out wrong, is gone. */
    const abort = (err: unknown) => {
      source.destroy(); // stop reading: the rest of the body is never pulled
      if (settled) return;
      settled = true;
      const error =
        err instanceof ApiError
          ? err
          : badUpload(
              "That upload could not be read. Try attaching the file again.",
            );
      if (!saving) return reject(error);
      saving
        .then(
          (saved) => store.remove(saved.storedName),
          () => {},
        )
        .finally(() => reject(error));
    };
    let total = 0;
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        total += chunk.length;
        if (total > store.maxBytes + FRAMING_BYTES)
          done(
            new ApiError(
              413,
              "material-too-large",
              `That file is over ${store.maxWords}, so it was not attached.`,
            ),
          );
        else done(null, chunk);
      },
    });
    let form: busboy.Busboy;
    try {
      form = busboy({
        headers: { "content-type": contentType },
        preservePath: true, // keep a ../ in the name so the store can refuse it
        defParamCharset: "utf8",
        limits: { files: 1, fields: 4, fieldSize: 1024, parts: 6 },
      });
    } catch {
      return reject(badUpload("Choose one file to attach."));
    }
    form.on("file", (field, file, info) => {
      // a file cut off part way is reported through `abort`; its own error needs no second listener
      file.on("error", () => {});
      files += 1;
      if (field !== "file" || files > 1) {
        file.resume();
        abort(badUpload("Attach one file at a time."));
        return;
      }
      saving = store.save({ name: info.filename ?? "", stream: file });
      saving.catch(abort);
    });
    form.on("filesLimit", () => abort(badUpload("Attach one file at a time.")));
    form.on("partsLimit", () =>
      abort(badUpload("That upload has too many parts.")),
    );
    form.on("error", abort);
    form.on("close", () => {
      if (!saving) return abort(badUpload("Choose one file to attach."));
      saving.then((saved) => {
        if (!settled) {
          settled = true;
          resolve(saved);
        }
      }, abort);
    });
    pipeline(source, counter, form, (err) => {
      if (err) abort(err);
    });
  });
}
