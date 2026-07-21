# Bucket S3 para las grabaciones de las videollamadas (Chime Media Pipelines).
resource "aws_s3_bucket" "recordings" {
  bucket = "${var.project}-recordings-${data.aws_caller_identity.current.account_id}"

  tags = { Component = "recordings" }
}

# Bloquear acceso público (los MP4 se sirven por presigned URL).
resource "aws_s3_bucket_public_access_block" "recordings" {
  bucket                  = aws_s3_bucket.recordings.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Chime Media Pipelines escribe los objetos con ACL bucket-owner-full-control,
# así que las ACLs deben estar HABILITADAS (BucketOwnerPreferred). Con
# BucketOwnerEnforced (default) la grabación falla ("Insufficient permission").
resource "aws_s3_bucket_ownership_controls" "recordings" {
  bucket = aws_s3_bucket.recordings.id
  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

# (Opcional) Lifecycle para auto-expirar grabaciones viejas. Desactivado por
# defecto (retención indefinida). Sube expiration_days > 0 para activarlo.
resource "aws_s3_bucket_lifecycle_configuration" "recordings" {
  count  = var.recordings_expiration_days > 0 ? 1 : 0
  bucket = aws_s3_bucket.recordings.id

  rule {
    id     = "expire-old-recordings"
    status = "Enabled"
    filter {}
    expiration {
      days = var.recordings_expiration_days
    }
  }
}

# Policy que permite al servicio de Chime Media Pipelines escribir/leer en el bucket.
# Condición aws:SourceAccount (confused-deputy) limitada a esta cuenta.
resource "aws_s3_bucket_policy" "recordings" {
  bucket = aws_s3_bucket.recordings.id

  # Depende del ownership (ACLs) y del public-access-block para evitar carreras.
  depends_on = [
    aws_s3_bucket_ownership_controls.recordings,
    aws_s3_bucket_public_access_block.recordings,
  ]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AWSChimeMediaPipelines"
        Effect    = "Allow"
        Principal = { Service = "mediapipelines.chime.amazonaws.com" }
        Action    = ["s3:PutObject", "s3:PutObjectAcl", "s3:GetObject", "s3:GetBucketLocation", "s3:ListBucket"]
        Resource = [
          aws_s3_bucket.recordings.arn,
          "${aws_s3_bucket.recordings.arn}/*",
        ]
        Condition = {
          StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
        }
      }
    ]
  })
}
