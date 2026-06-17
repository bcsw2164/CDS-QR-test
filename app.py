from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import cv2
import base64

app = Flask(__name__)
CORS(app)

TARGET_SIZE = 500


def adaptive_binarize(gray):
    resized = cv2.resize(gray, (TARGET_SIZE, TARGET_SIZE))
    return cv2.adaptiveThreshold(
        resized, 255,
        cv2.ADAPTIVE_THRESH_MEAN_C,
        cv2.THRESH_BINARY,
        blockSize=11, C=2,
    )


def sort_corners(pts):
    """4개 꼭짓점을 TL→TR→BR→BL 순서로 정렬"""
    pts  = pts.reshape(4, 2).astype(np.float32)
    s    = pts.sum(axis=1)
    diff = np.diff(pts, axis=1).flatten()
    return np.array([
        pts[np.argmin(s)],    # TL (x+y 최소)
        pts[np.argmin(diff)], # TR (y-x 최소)
        pts[np.argmax(s)],    # BR (x+y 최대)
        pts[np.argmax(diff)], # BL (y-x 최대)
    ], dtype=np.float32)


# ── 기준 이미지 로드 (서버 시작 시 1회) ──────────
_original_gray = cv2.imread('original.png', cv2.IMREAD_GRAYSCALE)
original_thresh = adaptive_binarize(_original_gray) if _original_gray is not None else None

_qr1_gray = cv2.imread('qr-1.jpg', cv2.IMREAD_GRAYSCALE)
_qr2_gray = cv2.imread('qr-2.jpg', cv2.IMREAD_GRAYSCALE)

orb = cv2.ORB_create(nfeatures=500)
bf  = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)

des_qr1 = orb.detectAndCompute(_qr1_gray, None)[1] if _qr1_gray is not None else None
des_qr2 = orb.detectAndCompute(_qr2_gray, None)[1] if _qr2_gray is not None else None

qr_detector = cv2.QRCodeDetector()


# ── POST /predict ─────────────────────────────
@app.route('/predict', methods=['POST'])
def predict():
    data = request.get_json(force=True)
    if not data or 'image' not in data:
        return jsonify({'error': 'NO_IMAGE'}), 400

    # base64 → OpenCV BGR
    try:
        img_b64 = data['image']
        if ',' in img_b64:
            img_b64 = img_b64.split(',', 1)[1]
        img = cv2.imdecode(
            np.frombuffer(base64.b64decode(img_b64), np.uint8),
            cv2.IMREAD_COLOR,
        )
    except Exception:
        return jsonify({'error': 'DECODE_ERROR'}), 400

    if img is None:
        return jsonify({'error': 'DECODE_ERROR'}), 400

    # QR 꼭짓점 검출
    retval, points = qr_detector.detect(img)
    if not retval or points is None:
        return jsonify({'error': 'QR_NOT_FOUND'})

    # warpPerspective → 500×500
    src_pts = sort_corners(points[0])
    dst_pts = np.array(
        [[0, 0], [TARGET_SIZE, 0], [TARGET_SIZE, TARGET_SIZE], [0, TARGET_SIZE]],
        dtype=np.float32,
    )
    M      = cv2.getPerspectiveTransform(src_pts, dst_pts)
    warped = cv2.warpPerspective(img, M, (TARGET_SIZE, TARGET_SIZE))

    # 적응형 이진화
    warped_thresh = cv2.adaptiveThreshold(
        cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY), 255,
        cv2.ADAPTIVE_THRESH_MEAN_C,
        cv2.THRESH_BINARY,
        blockSize=11, C=2,
    )

    # ORB 매칭 → qr-1 / qr-2 식별
    _, des_w = orb.detectAndCompute(warped_thresh, None)
    score1, score2 = 0, 0
    if des_w is not None:
        if des_qr1 is not None:
            score1 = len(bf.match(des_w, des_qr1))
        if des_qr2 is not None:
            score2 = len(bf.match(des_w, des_qr2))
    qr_id = 1 if score1 >= score2 else 2

    # 오차 스코어: original.png 이진화 이미지와 픽셀 비교
    error_score = 0.0
    if original_thresh is not None:
        diff = cv2.absdiff(warped_thresh, original_thresh)
        error_score = float(np.mean(diff)) / 255.0

    return jsonify({
        'id':         qr_id,
        'errorScore': round(error_score, 4),
        'message':    f'{qr_id}번 손그림 인식',
    })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
