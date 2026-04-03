import com.sun.net.httpserver.*;
import java.io.*;
import java.net.*;
import java.nio.file.*;
import java.time.*;
import java.time.format.*;
import java.util.*;
import java.util.stream.*;

/**
 * ChatBackupServer.java
 * ─────────────────────────────────────────────────────────────────────────
 * A lightweight local HTTP server that receives chat backups from your
 * website and saves them as .json + .txt files in your Downloads folder.
 *
 * HOW TO RUN:
 *   Double-click start-server.bat   (or: javac ChatBackupServer.java && java ChatBackupServer)
 *
 * KEEP IT RUNNING while you use the website. When you click "Backup Chat",
 * the files are saved automatically.
 * ─────────────────────────────────────────────────────────────────────────
 */
public class ChatBackupServer {

    static final int    PORT          = 7432;
    static final String DOWNLOADS_DIR = System.getProperty("user.home") + "\\Downloads\\ChatBackups";

    public static void main(String[] args) throws Exception {

        // Create the ChatBackups folder inside Downloads if it doesn't exist
        Files.createDirectories(Paths.get(DOWNLOADS_DIR));

        HttpServer server = HttpServer.create(new InetSocketAddress("localhost", PORT), 0);

        // ── CORS pre-flight + backup endpoint ────────────────────────────
        server.createContext("/backup", new BackupHandler());
        server.createContext("/ping",   new PingHandler());
        server.setExecutor(null);
        server.start();

        System.out.println("╔══════════════════════════════════════════════════╗");
        System.out.println("║        Chat Backup Server — RUNNING  ✅          ║");
        System.out.println("╠══════════════════════════════════════════════════╣");
        System.out.println("║  Port    : " + PORT + "                                  ║");
        System.out.println("║  Saving  : " + DOWNLOADS_DIR.replace(System.getProperty("user.home"), "%USERPROFILE%"));
        System.out.println("╠══════════════════════════════════════════════════╣");
        System.out.println("║  Keep this window open while using the website.  ║");
        System.out.println("║  Press Ctrl+C to stop the server.                ║");
        System.out.println("╚══════════════════════════════════════════════════╝");
    }

    // ── CORS helper ───────────────────────────────────────────────────────
    static void addCorsHeaders(HttpExchange ex) {
        Headers h = ex.getResponseHeaders();
        h.add("Access-Control-Allow-Origin",  "*");
        h.add("Access-Control-Allow-Methods", "POST, OPTIONS");
        h.add("Access-Control-Allow-Headers", "Content-Type");
    }

    // ── /ping — lets the website check if server is running ──────────────
    static class PingHandler implements HttpHandler {
        public void handle(HttpExchange ex) throws IOException {
            addCorsHeaders(ex);
            if (ex.getRequestMethod().equalsIgnoreCase("OPTIONS")) {
                ex.sendResponseHeaders(204, -1);
                return;
            }
            byte[] resp = "{\"status\":\"ok\"}".getBytes();
            ex.sendResponseHeaders(200, resp.length);
            ex.getResponseBody().write(resp);
            ex.getResponseBody().close();
        }
    }

    // ── /backup — receives JSON body and saves files ──────────────────────
    static class BackupHandler implements HttpHandler {
        public void handle(HttpExchange ex) throws IOException {
            addCorsHeaders(ex);

            // Handle CORS pre-flight
            if (ex.getRequestMethod().equalsIgnoreCase("OPTIONS")) {
                ex.sendResponseHeaders(204, -1);
                return;
            }

            if (!ex.getRequestMethod().equalsIgnoreCase("POST")) {
                ex.sendResponseHeaders(405, -1);
                return;
            }

            try {
                // Read request body
                String body = new BufferedReader(new InputStreamReader(ex.getRequestBody()))
                        .lines().collect(Collectors.joining("\n"));

                // Parse fields
                String roomName   = getJsonString(body, "roomName");
                String exportedBy = getJsonString(body, "exportedBy");
                String exportedAt = getJsonString(body, "exportedAt");
                String totalStr   = getJsonString(body, "totalMessages");

                // Build safe filename
                String safeRoom = roomName.replaceAll("[^a-zA-Z0-9_\\-]", "_");
                String dateStr  = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));
                String timeStr  = LocalTime.now().format(DateTimeFormatter.ofPattern("HH-mm-ss"));
                String baseName = "backup_" + safeRoom + "_" + dateStr + "_" + timeStr;

                // Save .json
                Path jsonPath = Paths.get(DOWNLOADS_DIR, baseName + ".json");
                Files.write(jsonPath, body.getBytes());

                // Build and save .txt transcript
                String transcript = buildTranscript(body, roomName, exportedBy, exportedAt, totalStr);
                Path txtPath = Paths.get(DOWNLOADS_DIR, baseName + ".txt");
                Files.write(txtPath, transcript.getBytes("UTF-8"));

                // Console log
                System.out.println("\n✅  Backup received!");
                System.out.println("   Room    : " + roomName);
                System.out.println("   By      : " + exportedBy);
                System.out.println("   Messages: " + totalStr);
                System.out.println("   Saved   : " + jsonPath.getFileName());
                System.out.println("             " + txtPath.getFileName());

                // Respond
                String resp = "{\"status\":\"saved\",\"file\":\"" + baseName + "\"}";
                byte[] respBytes = resp.getBytes();
                ex.sendResponseHeaders(200, respBytes.length);
                ex.getResponseBody().write(respBytes);
                ex.getResponseBody().close();

            } catch (Exception e) {
                System.err.println("❌ Error saving backup: " + e.getMessage());
                e.printStackTrace();
                byte[] err = ("{\"status\":\"error\",\"message\":\"" + e.getMessage() + "\"}").getBytes();
                ex.sendResponseHeaders(500, err.length);
                ex.getResponseBody().write(err);
                ex.getResponseBody().close();
            }
        }
    }

    // ── Build a readable .txt transcript from the JSON body ───────────────
    static String buildTranscript(String json, String roomName, String exportedBy,
                                   String exportedAt, String totalStr) {
        StringBuilder sb = new StringBuilder();
        String line  = "─".repeat(68);
        String dline = "═".repeat(68);

        sb.append(dline).append("\n");
        sb.append("  CHAT TRANSCRIPT\n");
        sb.append(dline).append("\n");
        sb.append("  Room       : ").append(roomName).append("\n");
        sb.append("  Exported by: ").append(exportedBy).append("\n");
        sb.append("  Exported at: ").append(exportedAt).append("\n");
        sb.append("  Messages   : ").append(totalStr).append("\n");
        sb.append(dline).append("\n\n");

        // Parse messages array
        int arrStart = json.indexOf("[");
        int arrEnd   = json.lastIndexOf("]");
        if (arrStart != -1 && arrEnd != -1) {
            String arrayJson = json.substring(arrStart, arrEnd + 1);
            List<String> objects = splitJsonArray(arrayJson);
            for (String obj : objects) {
                String sender    = getJsonString(obj, "sender");
                String text      = getJsonString(obj, "text");
                String timestamp = getJsonString(obj, "timestamp");
                String fileURL   = getJsonString(obj, "fileURL");
                String fileType  = getJsonString(obj, "fileType");
                String fileName  = getJsonString(obj, "fileName");

                String time = formatTimestamp(timestamp);

                String content;
                if (!fileURL.isEmpty()) {
                    if (fileType.equals("image"))      content = "[Image: " + fileName + "] " + fileURL;
                    else if (fileType.equals("video")) content = "[Video: " + fileName + "] " + fileURL;
                    else                               content = "[File: "  + fileName + "] " + fileURL;
                } else {
                    content = text;
                }

                sb.append("  [").append(time).append("]  ").append(sender).append("\n");
                sb.append("  ").append(content).append("\n");
                sb.append("  ").append(line).append("\n");
            }
        }

        sb.append("\n").append(dline).append("\n");
        sb.append("  End of transcript\n");
        sb.append(dline).append("\n");
        return sb.toString();
    }

    // ── Minimal JSON helpers (no external libs) ───────────────────────────
    static String getJsonString(String json, String key) {
        String search = "\"" + key + "\"";
        int idx = json.indexOf(search);
        if (idx == -1) return "";
        idx += search.length();
        while (idx < json.length() && (json.charAt(idx) == ' ' || json.charAt(idx) == ':')) idx++;
        if (idx >= json.length()) return "";
        char first = json.charAt(idx);
        if (first == '"') {
            int start = idx + 1, end = start;
            while (end < json.length()) {
                if (json.charAt(end) == '"' && json.charAt(end - 1) != '\\') break;
                end++;
            }
            return json.substring(start, end)
                       .replace("\\n", "\n").replace("\\\"", "\"").replace("\\\\", "\\");
        } else if (first == 'n') {
            return "";
        } else {
            int start = idx, end = start;
            while (end < json.length() && json.charAt(end) != ',' && json.charAt(end) != '}') end++;
            return json.substring(start, end).trim();
        }
    }

    static List<String> splitJsonArray(String arrayJson) {
        List<String> result = new ArrayList<>();
        int depth = 0, start = -1;
        for (int i = 0; i < arrayJson.length(); i++) {
            char c = arrayJson.charAt(i);
            if (c == '{') { if (depth++ == 0) start = i; }
            else if (c == '}') { if (--depth == 0 && start != -1) { result.add(arrayJson.substring(start, i + 1)); start = -1; } }
        }
        return result;
    }

    static String formatTimestamp(String ts) {
        if (ts == null || ts.isEmpty()) return "unknown time";
        try {
            // ISO format: 2024-01-15T14:30:00.000Z
            String clean = ts.replace("Z", "").replaceAll("\\.\\d+$", "");
            return clean.replace("T", " ");
        } catch (Exception e) {
            return ts;
        }
    }
}