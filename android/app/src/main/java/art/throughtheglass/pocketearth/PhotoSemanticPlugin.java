package art.throughtheglass.pocketearth;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;
import android.content.ContentUris;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Size;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.FloatBuffer;
import java.nio.IntBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.GZIPInputStream;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Native, offline photo semantic search bridge.
 *
 * The first verified runtime deliberately mirrors PicQuery's MIT-licensed
 * Android CLIP path: MediaStore thumbnail -> CLIP image tower -> 512-D vector
 * -> SQLite; query text -> paired CLIP text tower -> cosine top-k. Originals
 * never leave MediaStore and neither pixels nor query text are persisted.
 *
 * Model weights are an independently pinned asset bundle. The bridge exposes
 * their exact identity and hashes so a later MobileCLIP2 pair can replace this
 * baseline without pretending that two incompatible embedding spaces match.
 */
@CapacitorPlugin(name = "PocketPhotoSemantic")
public class PhotoSemanticPlugin extends Plugin {
    private static final String MODEL_ID = "openai/clip-vit-base-patch32";
    // v2 changes preprocessing from stretch-to-square to CLIP's canonical
    // resize-short-edge + center-crop, so vectors from v1 must be rebuilt.
    private static final String MODEL_VERSION = "picquery-clip-vit-b32-ort-int8-v2-crop";
    private static final String BACKEND = "android-ort-int8";
    private static final int IMAGE_SIZE = 224;
    private static final int DIMENSION = 512;
    private static final int CONTEXT_LENGTH = 77;
    private static final String ASSET_ROOT = "photo-semantic/";
    private static final String IMAGE_MODEL = "clip-image-int8.ort";
    private static final String TEXT_MODEL = "clip-text-int8.ort";
    private static final String BPE_VOCAB = "bpe_vocab_gz";
    private static final long IMAGE_BYTES = 95_876_592L;
    private static final long TEXT_BYTES = 64_545_680L;
    private static final long BPE_BYTES = 1_356_917L;
    private static final String IMAGE_SHA = "977f817cd83a37dbad50ac2629476f3792fe334c76f95ad8873434bb9faa6090";
    private static final String TEXT_SHA = "fb5277500358c43f6309e588da7e30b4aaf0e976ba559ad8b3af481985457ee5";
    private static final String BPE_SHA = "924691ac288e54409236115652ad4aa250f48203de50a9e4722a6ecd48d6804a";
    private static final float[] MEAN = {0.48145467f, 0.4578275f, 0.40821072f};
    private static final float[] STD = {0.26862955f, 0.2613026f, 0.2757771f};

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile boolean cancelled = false;
    private volatile SemanticRuntime runtime;
    private SemanticDatabase database;

    @Override
    public void load() {
        database = new SemanticDatabase();
    }

    @Override
    protected void handleOnDestroy() {
        cancelled = true;
        executor.shutdownNow();
        closeRuntime();
        if (database != null) database.close();
        super.handleOnDestroy();
    }

    @PluginMethod
    public void status(PluginCall call) {
        executor.execute(() -> {
            try { call.resolve(statusObject()); }
            catch (Throwable error) { call.reject(errorMessage(error), asException(error)); }
        });
    }

    @PluginMethod
    public void install(PluginCall call) {
        executor.execute(() -> {
            try {
                ensureModelsInstalled(true);
                call.resolve(statusObject());
            } catch (Throwable error) {
                call.reject(errorMessage(error), asException(error));
            }
        });
    }

    @PluginMethod
    public void buildIndex(PluginCall call) {
        JSArray input = call.getArray("assets", new JSArray());
        cancelled = false;
        executor.execute(() -> {
            long started = System.currentTimeMillis();
            int indexed = 0;
            int reused = 0;
            int failed = 0;
            try {
                ensureModelsInstalled(true);
                SemanticRuntime active = ensureRuntime();
                int total = input.length();
                for (int index = 0; index < total; index++) {
                    if (cancelled) break;
                    JSONObject item = input.getJSONObject(index);
                    String key = item.optString("key", "");
                    String assetId = item.optString("assetId", "");
                    long modifiedAt = item.optLong("sourceModifiedAt", 0L);
                    if (key.isEmpty() || !assetId.startsWith("image:")) {
                        failed++;
                        emitProgress(index + 1, total, "跳过非 MediaStore 照片");
                        continue;
                    }
                    if (database.isCurrent(key, modifiedAt)) {
                        reused++;
                        emitProgress(index + 1, total, "复用本地语义向量");
                        continue;
                    }
                    Bitmap bitmap = null;
                    try {
                        bitmap = loadThumbnail(assetId);
                        if (bitmap == null) throw new IllegalStateException("photo_thumbnail_unavailable");
                        byte[] vector = quantize(active.encodeImage(bitmap));
                        database.put(key, modifiedAt, vector);
                        indexed++;
                    } catch (Throwable ignored) {
                        failed++;
                    } finally {
                        if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
                    }
                    emitProgress(index + 1, total, "生成并保存 512 维本地向量");
                }
                JSObject result = modelIdentity();
                result.put("indexed", indexed);
                result.put("reused", reused);
                result.put("failed", failed);
                result.put("cancelled", cancelled);
                result.put("count", database.count());
                result.put("durationMs", System.currentTimeMillis() - started);
                call.resolve(result);
            } catch (Throwable error) {
                call.reject(errorMessage(error), asException(error));
            } finally {
                cancelled = false;
            }
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        cancelled = true;
        JSObject result = new JSObject();
        result.put("cancelled", true);
        call.resolve(result);
    }

    @PluginMethod
    public void search(PluginCall call) {
        String query = call.getString("query", "").trim();
        int limit = Math.max(1, Math.min(200, call.getInt("limit", 60)));
        if (query.isEmpty()) {
            JSObject result = modelIdentity();
            result.put("matches", new JSArray());
            call.resolve(result);
            return;
        }
        executor.execute(() -> {
            try {
                ensureModelsInstalled(false);
                byte[] queryVector = quantize(ensureRuntime().encodeText(query));
                JSObject result = modelIdentity();
                result.put("matches", database.search(queryVector, limit));
                result.put("count", database.count());
                call.resolve(result);
            } catch (Throwable error) {
                call.reject(errorMessage(error), asException(error));
            }
        });
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = call.getString("key", "");
        executor.execute(() -> {
            database.remove(key);
            JSObject result = new JSObject();
            result.put("removed", !key.isEmpty());
            result.put("count", database.count());
            call.resolve(result);
        });
    }

    @PluginMethod
    public void reconcile(PluginCall call) {
        JSArray keys = call.getArray("availableKeys", new JSArray());
        boolean prune = call.getBoolean("prune", false);
        executor.execute(() -> {
            try {
                Set<String> available = new HashSet<>();
                for (int index = 0; index < keys.length(); index++) available.add(keys.getString(index));
                JSObject result = database.reconcile(available, prune);
                call.resolve(result);
            } catch (Throwable error) {
                call.reject(errorMessage(error), asException(error));
            }
        });
    }

    @PluginMethod
    public void clear(PluginCall call) {
        executor.execute(() -> {
            database.clear();
            JSObject result = new JSObject();
            result.put("count", 0);
            call.resolve(result);
        });
    }

    private JSObject statusObject() {
        JSObject result = modelIdentity();
        result.put("available", true);
        result.put("bundled", bundledAssetsPresent());
        result.put("installed", installedModelsValid());
        result.put("ready", runtime != null && installedModelsValid());
        result.put("count", database.count());
        result.put("originalsCopied", false);
        result.put("networkRequired", false);
        return result;
    }

    private JSObject modelIdentity() {
        JSObject result = new JSObject();
        result.put("modelId", MODEL_ID);
        result.put("version", MODEL_VERSION);
        result.put("backend", BACKEND);
        result.put("dimension", DIMENSION);
        result.put("imageInput", IMAGE_SIZE + "x" + IMAGE_SIZE);
        result.put("textTokens", CONTEXT_LENGTH);
        result.put("imageSha256", IMAGE_SHA);
        result.put("textSha256", TEXT_SHA);
        return result;
    }

    private void emitProgress(int done, int total, String phase) {
        JSObject event = new JSObject();
        event.put("done", done);
        event.put("total", total);
        event.put("phase", phase);
        event.put("version", MODEL_VERSION);
        notifyListeners("photoSemanticProgress", event);
    }

    private synchronized SemanticRuntime ensureRuntime() throws Exception {
        if (runtime == null) {
            File root = modelDirectory();
            runtime = new SemanticRuntime(
                new File(root, IMAGE_MODEL),
                new File(root, TEXT_MODEL),
                new File(root, BPE_VOCAB)
            );
        }
        return runtime;
    }

    private synchronized void closeRuntime() {
        if (runtime == null) return;
        try { runtime.close(); } catch (Exception ignored) {}
        runtime = null;
    }

    private void ensureModelsInstalled(boolean allowInstall) throws Exception {
        if (installedModelsValid()) return;
        closeRuntime();
        if (!allowInstall) throw new IllegalStateException("photo_semantic_model_not_installed");
        if (!bundledAssetsPresent()) throw new IllegalStateException("photo_semantic_assets_not_bundled");
        File root = modelDirectory();
        if (!root.isDirectory() && !root.mkdirs()) throw new IllegalStateException("photo_semantic_model_directory_unavailable");
        copyVerifiedAsset(IMAGE_MODEL, IMAGE_BYTES, IMAGE_SHA);
        copyVerifiedAsset(TEXT_MODEL, TEXT_BYTES, TEXT_SHA);
        copyVerifiedAsset(BPE_VOCAB, BPE_BYTES, BPE_SHA);
        if (!installedModelsValid()) throw new IllegalStateException("photo_semantic_asset_verification_failed");
    }

    private boolean bundledAssetsPresent() {
        try (InputStream image = getContext().getAssets().open(ASSET_ROOT + IMAGE_MODEL);
             InputStream text = getContext().getAssets().open(ASSET_ROOT + TEXT_MODEL);
             InputStream bpe = getContext().getAssets().open(ASSET_ROOT + BPE_VOCAB)) {
            return image.read() >= 0 && text.read() >= 0 && bpe.read() >= 0;
        } catch (Exception ignored) {
            return false;
        }
    }

    private File modelDirectory() {
        return new File(getContext().getFilesDir(), "pocket-earth/photo-semantic/" + MODEL_VERSION);
    }

    private boolean installedModelsValid() {
        File root = modelDirectory();
        return exactFile(new File(root, IMAGE_MODEL), IMAGE_BYTES)
            && exactFile(new File(root, TEXT_MODEL), TEXT_BYTES)
            && exactFile(new File(root, BPE_VOCAB), BPE_BYTES)
            && markerValid(new File(root, "bundle.sha256"));
    }

    private boolean markerValid(File marker) {
        if (!marker.isFile()) return false;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(marker), StandardCharsets.UTF_8))) {
            return (IMAGE_SHA + ":" + TEXT_SHA + ":" + BPE_SHA).equals(reader.readLine());
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean exactFile(File file, long bytes) {
        return file.isFile() && file.length() == bytes;
    }

    private void copyVerifiedAsset(String name, long bytes, String sha) throws Exception {
        File target = new File(modelDirectory(), name);
        if (exactFile(target, bytes) && sha.equals(sha256(target))) {
            writeBundleMarkerIfReady();
            return;
        }
        File part = new File(target.getPath() + ".part");
        if (part.isFile() && !part.delete()) throw new IllegalStateException("cannot_reset_" + name);
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        long copied = 0L;
        try (InputStream input = new BufferedInputStream(getContext().getAssets().open(ASSET_ROOT + name));
             FileOutputStream output = new FileOutputStream(part)) {
            byte[] buffer = new byte[1024 * 1024];
            for (;;) {
                int count = input.read(buffer);
                if (count < 0) break;
                output.write(buffer, 0, count);
                digest.update(buffer, 0, count);
                copied += count;
                if (copied > bytes) throw new IllegalStateException("photo_semantic_asset_oversized:" + name);
            }
            output.getFD().sync();
        }
        if (copied != bytes || !sha.equals(hex(digest.digest()))) {
            part.delete();
            throw new IllegalStateException("photo_semantic_asset_hash_mismatch:" + name);
        }
        if (target.isFile() && !target.delete()) throw new IllegalStateException("cannot_replace_" + name);
        if (!part.renameTo(target)) throw new IllegalStateException("cannot_activate_" + name);
        writeBundleMarkerIfReady();
    }

    private void writeBundleMarkerIfReady() throws Exception {
        File root = modelDirectory();
        if (!exactFile(new File(root, IMAGE_MODEL), IMAGE_BYTES)
            || !exactFile(new File(root, TEXT_MODEL), TEXT_BYTES)
            || !exactFile(new File(root, BPE_VOCAB), BPE_BYTES)) return;
        File marker = new File(root, "bundle.sha256");
        try (FileOutputStream output = new FileOutputStream(marker)) {
            output.write((IMAGE_SHA + ":" + TEXT_SHA + ":" + BPE_SHA + "\n").getBytes(StandardCharsets.UTF_8));
            output.getFD().sync();
        }
    }

    private String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new BufferedInputStream(new FileInputStream(file))) {
            byte[] buffer = new byte[1024 * 1024];
            for (;;) {
                int count = input.read(buffer);
                if (count < 0) break;
                digest.update(buffer, 0, count);
            }
        }
        return hex(digest.digest());
    }

    private String hex(byte[] bytes) {
        StringBuilder value = new StringBuilder(bytes.length * 2);
        for (byte item : bytes) value.append(String.format(Locale.ROOT, "%02x", item & 0xff));
        return value.toString();
    }

    private Bitmap loadThumbnail(String assetId) throws Exception {
        long numericId = Long.parseLong(assetId.substring("image:".length()));
        Uri base = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            ? MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
            : MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
        Uri uri = ContentUris.withAppendedId(base, numericId);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return getContext().getContentResolver().loadThumbnail(uri, new Size(IMAGE_SIZE, IMAGE_SIZE), null);
        }
        Bitmap source = MediaStore.Images.Thumbnails.getThumbnail(
            getContext().getContentResolver(), numericId, MediaStore.Images.Thumbnails.MINI_KIND, null
        );
        if (source == null) return null;
        Bitmap scaled = Bitmap.createScaledBitmap(source, IMAGE_SIZE, IMAGE_SIZE, true);
        if (scaled != source) source.recycle();
        return scaled;
    }

    private byte[] quantize(float[] values) {
        if (values.length != DIMENSION) throw new IllegalArgumentException("photo_semantic_dimension_mismatch");
        double norm = 0.0;
        for (float value : values) norm += value * value;
        norm = Math.sqrt(norm);
        if (norm <= 0.0) throw new IllegalArgumentException("photo_semantic_zero_vector");
        byte[] result = new byte[DIMENSION];
        for (int index = 0; index < DIMENSION; index++) {
            int value = (int) Math.round(values[index] / norm * 127.0);
            result[index] = (byte) Math.max(-127, Math.min(127, value));
        }
        return result;
    }

    private String errorMessage(Throwable error) {
        String message = error.getMessage();
        return error.getClass().getSimpleName() + ": " + (message == null ? "photo_semantic_error" : message);
    }

    private Exception asException(Throwable error) {
        return error instanceof Exception ? (Exception) error : new Exception(error);
    }

    private static final class Match {
        final String key;
        final double score;
        Match(String key, double score) { this.key = key; this.score = score; }
    }

    private final class SemanticDatabase extends SQLiteOpenHelper {
        SemanticDatabase() { super(getContext(), "pocket-photo-semantic.db", null, 1); }

        @Override
        public void onCreate(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE embeddings (asset_key TEXT PRIMARY KEY, model_version TEXT NOT NULL, source_modified INTEGER NOT NULL, vector BLOB NOT NULL, generated_at INTEGER NOT NULL)");
            db.execSQL("CREATE INDEX embeddings_version_idx ON embeddings(model_version)");
        }

        @Override
        public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
            db.execSQL("DROP TABLE IF EXISTS embeddings");
            onCreate(db);
        }

        boolean isCurrent(String key, long modifiedAt) {
            try (Cursor cursor = getReadableDatabase().query(
                "embeddings", new String[] {"source_modified"},
                "asset_key=? AND model_version=?", new String[] {key, MODEL_VERSION},
                null, null, null, "1"
            )) {
                return cursor.moveToFirst() && cursor.getLong(0) == modifiedAt;
            }
        }

        void put(String key, long modifiedAt, byte[] vector) {
            ContentValues values = new ContentValues();
            values.put("asset_key", key);
            values.put("model_version", MODEL_VERSION);
            values.put("source_modified", modifiedAt);
            values.put("vector", vector);
            values.put("generated_at", System.currentTimeMillis());
            getWritableDatabase().insertWithOnConflict("embeddings", null, values, SQLiteDatabase.CONFLICT_REPLACE);
        }

        int count() {
            try (Cursor cursor = getReadableDatabase().rawQuery(
                "SELECT COUNT(*) FROM embeddings WHERE model_version=?", new String[] {MODEL_VERSION}
            )) {
                return cursor.moveToFirst() ? cursor.getInt(0) : 0;
            }
        }

        JSArray search(byte[] query, int limit) {
            List<Match> matches = new ArrayList<>();
            try (Cursor cursor = getReadableDatabase().query(
                "embeddings", new String[] {"asset_key", "vector"}, "model_version=?",
                new String[] {MODEL_VERSION}, null, null, null
            )) {
                while (cursor.moveToNext()) {
                    byte[] vector = cursor.getBlob(1);
                    if (vector == null || vector.length != query.length) continue;
                    matches.add(new Match(cursor.getString(0), cosine(query, vector)));
                }
            }
            matches.sort(Comparator.comparingDouble((Match item) -> item.score).reversed().thenComparing(item -> item.key));
            JSArray result = new JSArray();
            for (int index = 0; index < Math.min(limit, matches.size()); index++) {
                Match match = matches.get(index);
                JSObject item = new JSObject();
                item.put("key", match.key);
                item.put("score", match.score);
                result.put(item);
            }
            return result;
        }

        private double cosine(byte[] left, byte[] right) {
            long dot = 0L;
            long aa = 0L;
            long bb = 0L;
            for (int index = 0; index < left.length; index++) {
                int a = left[index];
                int b = right[index];
                dot += (long) a * b;
                aa += (long) a * a;
                bb += (long) b * b;
            }
            return aa == 0L || bb == 0L ? -1.0 : dot / Math.sqrt((double) aa * bb);
        }

        void remove(String key) {
            if (!key.isEmpty()) getWritableDatabase().delete("embeddings", "asset_key=?", new String[] {key});
        }

        JSObject reconcile(Set<String> available, boolean prune) {
            List<String> orphaned = new ArrayList<>();
            try (Cursor cursor = getReadableDatabase().query(
                "embeddings", new String[] {"asset_key"}, "model_version=?",
                new String[] {MODEL_VERSION}, null, null, null
            )) {
                while (cursor.moveToNext()) {
                    String key = cursor.getString(0);
                    if (!available.contains(key)) orphaned.add(key);
                }
            }
            int total = count();
            double ratio = total == 0 ? 0.0 : (double) orphaned.size() / total;
            boolean safe = ratio <= 0.2;
            int removed = 0;
            if (prune && safe) {
                SQLiteDatabase db = getWritableDatabase();
                db.beginTransaction();
                try {
                    for (String key : orphaned) removed += db.delete("embeddings", "asset_key=?", new String[] {key});
                    db.setTransactionSuccessful();
                } finally {
                    db.endTransaction();
                }
            }
            JSObject result = new JSObject();
            result.put("indexed", total);
            result.put("availableAssets", available.size());
            result.put("orphaned", orphaned.size());
            result.put("orphanRatio", ratio);
            result.put("removed", removed);
            result.put("retainedForSafety", prune && !orphaned.isEmpty() && !safe);
            return result;
        }

        void clear() {
            getWritableDatabase().delete("embeddings", null, null);
        }
    }

    private static final class SemanticRuntime implements AutoCloseable {
        private final OrtEnvironment environment = OrtEnvironment.getEnvironment();
        private final OrtSession imageSession;
        private final OrtSession textSession;
        private final ClipTokenizer tokenizer;

        SemanticRuntime(File imageModel, File textModel, File bpeFile) throws Exception {
            OrtSession.SessionOptions imageOptions = new OrtSession.SessionOptions();
            imageOptions.addConfigEntry("session.load_model_format", "ORT");
            imageOptions.setIntraOpNumThreads(Math.max(1, Math.min(4, Runtime.getRuntime().availableProcessors() / 2)));
            OrtSession.SessionOptions textOptions = new OrtSession.SessionOptions();
            textOptions.addConfigEntry("session.load_model_format", "ORT");
            textOptions.setIntraOpNumThreads(Math.max(1, Math.min(4, Runtime.getRuntime().availableProcessors() / 2)));
            imageSession = environment.createSession(imageModel.getAbsolutePath(), imageOptions);
            textSession = environment.createSession(textModel.getAbsolutePath(), textOptions);
            tokenizer = new ClipTokenizer(bpeFile);
        }

        float[] encodeImage(Bitmap source) throws Exception {
            int sourceWidth = Math.max(1, source.getWidth());
            int sourceHeight = Math.max(1, source.getHeight());
            float scale = Math.max((float) IMAGE_SIZE / sourceWidth, (float) IMAGE_SIZE / sourceHeight);
            int scaledWidth = Math.max(IMAGE_SIZE, Math.round(sourceWidth * scale));
            int scaledHeight = Math.max(IMAGE_SIZE, Math.round(sourceHeight * scale));
            Bitmap scaled = sourceWidth == scaledWidth && sourceHeight == scaledHeight
                ? source : Bitmap.createScaledBitmap(source, scaledWidth, scaledHeight, true);
            int left = Math.max(0, (scaledWidth - IMAGE_SIZE) / 2);
            int top = Math.max(0, (scaledHeight - IMAGE_SIZE) / 2);
            Bitmap bitmap = scaledWidth == IMAGE_SIZE && scaledHeight == IMAGE_SIZE
                ? scaled : Bitmap.createBitmap(scaled, left, top, IMAGE_SIZE, IMAGE_SIZE);
            try {
                int[] pixels = new int[IMAGE_SIZE * IMAGE_SIZE];
                bitmap.getPixels(pixels, 0, IMAGE_SIZE, 0, 0, IMAGE_SIZE, IMAGE_SIZE);
                float[] input = new float[3 * IMAGE_SIZE * IMAGE_SIZE];
                int stride = IMAGE_SIZE * IMAGE_SIZE;
                for (int index = 0; index < pixels.length; index++) {
                    int pixel = pixels[index];
                    input[index] = (((pixel >> 16 & 0xff) / 255f) - MEAN[0]) / STD[0];
                    input[index + stride] = (((pixel >> 8 & 0xff) / 255f) - MEAN[1]) / STD[1];
                    input[index + stride * 2] = (((pixel & 0xff) / 255f) - MEAN[2]) / STD[2];
                }
                String inputName = imageSession.getInputNames().iterator().next();
                try (OnnxTensor tensor = OnnxTensor.createTensor(environment, FloatBuffer.wrap(input), new long[] {1, 3, IMAGE_SIZE, IMAGE_SIZE});
                     OrtSession.Result output = imageSession.run(Collections.singletonMap(inputName, tensor))) {
                    return floatOutput(output);
                }
            } finally {
                if (bitmap != source && !bitmap.isRecycled()) bitmap.recycle();
                if (scaled != source && scaled != bitmap && !scaled.isRecycled()) scaled.recycle();
            }
        }

        float[] encodeText(String text) throws Exception {
            int[] ids = tokenizer.tokenize(text);
            String inputName = textSession.getInputNames().iterator().next();
            try (OnnxTensor tensor = OnnxTensor.createTensor(environment, IntBuffer.wrap(ids), new long[] {1, CONTEXT_LENGTH});
                 OrtSession.Result output = textSession.run(Collections.singletonMap(inputName, tensor))) {
                return floatOutput(output);
            }
        }

        private float[] floatOutput(OrtSession.Result output) throws Exception {
            OnnxTensor tensor = (OnnxTensor) output.get(0);
            FloatBuffer buffer = tensor.getFloatBuffer();
            if (buffer == null || buffer.remaining() != DIMENSION) {
                throw new IllegalStateException("photo_semantic_output_dimension_mismatch");
            }
            float[] values = new float[DIMENSION];
            buffer.get(values);
            return values;
        }

        @Override
        public void close() throws Exception {
            imageSession.close();
            textSession.close();
        }
    }

    /** Java port of PicQuery's MIT CLIP BPE tokenizer. */
    private static final class ClipTokenizer {
        private static final String START = "<|startoftext|>";
        private static final String END = "<|endoftext|>";
        private static final String WORD_END = "</w>";
        private static final Pattern TOKEN_PATTERN = Pattern.compile(
            Pattern.quote(START) + "|" + Pattern.quote(END) + "|'s|'t|'re|'ve|'m|'ll|'d|[\\p{L}]+|[\\p{N}]|[^\\s\\p{L}\\p{N}]+"
        );
        private final Map<Integer, Character> byteEncoder = new LinkedHashMap<>();
        private final Map<String, Integer> encoder = new HashMap<>();
        private final Map<StringPair, Integer> ranks = new HashMap<>();
        private final Map<String, String> cache = new HashMap<>();

        ClipTokenizer(File bpeFile) throws Exception {
            buildByteEncoder();
            List<String> vocab = new ArrayList<>();
            for (Character character : byteEncoder.values()) vocab.add(String.valueOf(character));
            int baseSize = vocab.size();
            for (int index = 0; index < baseSize; index++) vocab.add(vocab.get(index) + WORD_END);
            List<StringPair> merges = new ArrayList<>();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                new GZIPInputStream(new FileInputStream(bpeFile)), StandardCharsets.UTF_8
            ))) {
                String line;
                int lineIndex = 0;
                while ((line = reader.readLine()) != null) {
                    if (lineIndex++ == 0) continue;
                    if (merges.size() >= 48_894) break;
                    String[] parts = line.split(" ");
                    if (parts.length >= 2) merges.add(new StringPair(parts[0], parts[1]));
                }
            }
            for (int index = 0; index < merges.size(); index++) {
                StringPair pair = merges.get(index);
                vocab.add(pair.left + pair.right);
                ranks.put(pair, index);
            }
            vocab.add(START);
            vocab.add(END);
            for (int index = 0; index < vocab.size(); index++) encoder.put(vocab.get(index), index);
            cache.put(START, START);
            cache.put(END, END);
        }

        int[] tokenize(String text) {
            List<Integer> tokens = new ArrayList<>();
            tokens.add(requiredId(START));
            Matcher matcher = TOKEN_PATTERN.matcher(text.replaceAll("\\s+", " ").trim().toLowerCase(Locale.ROOT));
            while (matcher.find()) {
                byte[] bytes = matcher.group().getBytes(StandardCharsets.UTF_8);
                StringBuilder encoded = new StringBuilder();
                for (byte value : bytes) encoded.append(byteEncoder.get(value & 0xff));
                for (String item : bpe(encoded.toString()).split(" ")) tokens.add(requiredId(item));
            }
            tokens.add(requiredId(END));
            int[] result = new int[CONTEXT_LENGTH];
            int length = Math.min(tokens.size(), CONTEXT_LENGTH);
            for (int index = 0; index < length; index++) result[index] = tokens.get(index);
            if (tokens.size() > CONTEXT_LENGTH) result[CONTEXT_LENGTH - 1] = requiredId(END);
            return result;
        }

        private int requiredId(String token) {
            Integer id = encoder.get(token);
            if (id == null) throw new IllegalStateException("clip_bpe_token_missing");
            return id;
        }

        private String bpe(String token) {
            String cached = cache.get(token);
            if (cached != null) return cached;
            if (token.isEmpty()) return token;
            List<String> word = new ArrayList<>();
            for (int index = 0; index < token.length() - 1; index++) word.add(String.valueOf(token.charAt(index)));
            word.add(token.charAt(token.length() - 1) + WORD_END);
            while (word.size() > 1) {
                Set<StringPair> pairs = pairs(word);
                StringPair best = null;
                int bestRank = Integer.MAX_VALUE;
                for (StringPair pair : pairs) {
                    Integer rank = ranks.get(pair);
                    if (rank != null && rank < bestRank) { best = pair; bestRank = rank; }
                }
                if (best == null) break;
                List<String> merged = new ArrayList<>();
                int index = 0;
                while (index < word.size()) {
                    if (index < word.size() - 1 && word.get(index).equals(best.left) && word.get(index + 1).equals(best.right)) {
                        merged.add(best.left + best.right);
                        index += 2;
                    } else {
                        merged.add(word.get(index++));
                    }
                }
                word = merged;
            }
            String result = String.join(" ", word);
            cache.put(token, result);
            return result;
        }

        private Set<StringPair> pairs(List<String> word) {
            Set<StringPair> result = new HashSet<>();
            for (int index = 0; index + 1 < word.size(); index++) result.add(new StringPair(word.get(index), word.get(index + 1)));
            return result;
        }

        private void buildByteEncoder() {
            List<Integer> bytes = new ArrayList<>();
            for (int value = 33; value <= 126; value++) bytes.add(value);
            for (int value = 161; value <= 172; value++) bytes.add(value);
            for (int value = 174; value <= 255; value++) bytes.add(value);
            List<Integer> chars = new ArrayList<>(bytes);
            int extra = 0;
            for (int value = 0; value <= 255; value++) {
                if (!bytes.contains(value)) { bytes.add(value); chars.add(256 + extra++); }
            }
            for (int index = 0; index < bytes.size(); index++) byteEncoder.put(bytes.get(index), (char) chars.get(index).intValue());
        }
    }

    private static final class StringPair {
        final String left;
        final String right;
        StringPair(String left, String right) { this.left = left; this.right = right; }
        @Override public boolean equals(Object other) {
            if (this == other) return true;
            if (!(other instanceof StringPair)) return false;
            StringPair pair = (StringPair) other;
            return left.equals(pair.left) && right.equals(pair.right);
        }
        @Override public int hashCode() { return 31 * left.hashCode() + right.hashCode(); }
    }
}
