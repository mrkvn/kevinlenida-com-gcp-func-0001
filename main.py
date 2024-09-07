import base64
import os
from io import BytesIO

import functions_framework
from flask import jsonify, send_file
from PyPDF2 import PdfReader, PdfWriter


@functions_framework.http
def main(request):
    payload = request.get_json()

    # Decode the base64 PDF file
    try:
        file_data = base64.b64decode(payload["file"])
    except Exception:
        return jsonify({"detail": "Invalid base64 file encoding"}), 400

    password = payload["password"]
    encrypted_pdf_path = f"/tmp/encrypted_{payload['filename']}"

    # Write the encrypted file to disk
    try:
        with open(encrypted_pdf_path, "wb") as f:
            f.write(file_data)
    except Exception:
        return jsonify({"detail": "Failed to write file to disk"}), 500

    # Decrypt the PDF and return as bytes
    try:
        with open(encrypted_pdf_path, "rb") as infile:
            reader = PdfReader(infile)
            if reader.is_encrypted:
                try:
                    reader.decrypt(password)
                except Exception:
                    return jsonify({"detail": "Incorrect password"}), 400

            writer = PdfWriter()
            for page in reader.pages:
                writer.add_page(page)

            decrypted_pdf_buffer = BytesIO()
            writer.write(decrypted_pdf_buffer)
            decrypted_pdf_buffer.seek(0)

        return send_file(
            decrypted_pdf_buffer,
            as_attachment=True,
            download_name=f"decrypted_{payload['filename']}",
            mimetype="application/pdf",
        )

    except Exception as e:
        return jsonify({"detail": f"Error processing PDF: {e}"}), 500
    finally:
        # Clean up the temporary files
        if os.path.exists(encrypted_pdf_path):
            try:
                os.remove(encrypted_pdf_path)
            except Exception:
                pass
