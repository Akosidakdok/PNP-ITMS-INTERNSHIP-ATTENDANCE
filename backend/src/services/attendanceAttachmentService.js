import { supabase } from '../supabaseClient.js';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Validate that the uploaded file is a valid image (JPG, PNG, WEBP) and under 5 MB.
 * Performs both MIME-type inspection and magic byte checking.
 */
export function validateAttachmentImage(file) {
  if (!file || !file.buffer) {
    const err = new Error('No image file uploaded');
    err.statusCode = 400;
    throw err;
  }

  if (file.size > MAX_FILE_SIZE) {
    const err = new Error('Image is too large. Maximum file size is 5 MB.');
    err.statusCode = 400;
    throw err;
  }

  const mime = file.mimetype?.toLowerCase();
  if (!mime || !ALLOWED_MIME_TYPES.has(mime)) {
    const err = new Error('Unsupported file format. Please upload JPG, PNG, or WEBP.');
    err.statusCode = 400;
    throw err;
  }

  const buf = file.buffer;
  let isValidMagic = false;

  if (mime === 'image/jpeg') {
    isValidMagic = buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
  } else if (mime === 'image/png') {
    isValidMagic = buf.length >= 8 &&
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47 &&
      buf[4] === 0x0D && buf[5] === 0x0A && buf[6] === 0x1A && buf[7] === 0x0A;
  } else if (mime === 'image/webp') {
    isValidMagic = buf.length >= 12 &&
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && // 'RIFF'
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;   // 'WEBP'
  }

  if (!isValidMagic) {
    const err = new Error('Unsupported file format. Please upload JPG, PNG, or WEBP.');
    err.statusCode = 400;
    throw err;
  }

  return true;
}

/**
 * Format raw attachment row into consistent API representation.
 */
function normalizeAttachment(data) {
  if (!data) return null;
  return {
    id: data.id,
    attendance_id: Number(data.attendance_id),
    image_url: data.image_url,
    file_name: data.file_name || data.original_filename || 'attendance-proof.jpg',
    original_filename: data.original_filename || data.file_name || 'attendance-proof.jpg',
    mime_type: data.mime_type || 'image/jpeg',
    file_size: Number(data.file_size) || 0,
    storage_path: data.storage_path || null,
    uploaded_by: data.uploaded_by || null,
    uploaded_by_name: data.uploaded_by_name || 'Super Admin',
    uploaded_at: data.uploaded_at || new Date().toISOString(),
    updated_at: data.updated_at || data.uploaded_at || new Date().toISOString(),
  };
}

/**
 * Retrieve the attachment for a specific attendance record ID.
 */
export async function getAttendanceAttachment(attendanceId) {
  if (!attendanceId) return null;

  try {
    const { data, error } = await supabase
      .from('attendance_attachments')
      .select('*')
      .eq('attendance_id', Number(attendanceId))
      .maybeSingle();

    if (!error && data) {
      return normalizeAttachment(data);
    }

    if (error && error.code !== 'PGRST205' && error.code !== '42P01') {
      console.warn('Error querying attendance_attachments:', error.message);
    }
  } catch (err) {
    console.warn('Exception querying attendance_attachments:', err.message);
  }

  // Graceful fallback to documents table if migration not yet applied
  try {
    const docType = `attendance_attachment:${attendanceId}`;
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('document_type', docType)
      .maybeSingle();

    if (docError || !doc) return null;

    let meta = {};
    try {
      meta = JSON.parse(doc.admin_remarks || '{}');
    } catch {
      meta = {};
    }

    const { data: publicUrlData } = supabase.storage
      .from('documents')
      .getPublicUrl(doc.file_path);

    return normalizeAttachment({
      id: doc.id,
      attendance_id: Number(attendanceId),
      image_url: meta.image_url || publicUrlData?.publicUrl,
      file_name: doc.original_name || doc.file_name,
      original_filename: doc.original_name || doc.file_name,
      mime_type: doc.file_type,
      file_size: doc.file_size,
      storage_path: doc.file_path,
      uploaded_by: meta.uploaded_by || null,
      uploaded_by_name: meta.uploaded_by_name || 'Super Admin',
      uploaded_at: doc.upload_date || doc.created_at,
      updated_at: meta.updated_at || doc.upload_date,
    });
  } catch (fallbackErr) {
    console.warn('Fallback documents query failed:', fallbackErr.message);
    return null;
  }
}

/**
 * Batch-retrieve attachments for multiple attendance IDs.
 * Used to efficiently hydrate attendance logs for table rendering.
 */
export async function getAttachmentsForLogs(attendanceIds = []) {
  const ids = attendanceIds.map(Number).filter(id => Boolean(id) && !Number.isNaN(id));
  if (ids.length === 0) return {};

  const map = {};

  try {
    const { data, error } = await supabase
      .from('attendance_attachments')
      .select('*')
      .in('attendance_id', ids);

    if (!error && Array.isArray(data)) {
      for (const item of data) {
        map[Number(item.attendance_id)] = normalizeAttachment(item);
      }
      return map;
    }
  } catch (err) {
    console.warn('Batch query attendance_attachments exception:', err.message);
  }

  // Fallback: batch query documents table
  try {
    const docTypes = ids.map(id => `attendance_attachment:${id}`);
    const { data: docs } = await supabase
      .from('documents')
      .select('*')
      .in('document_type', docTypes);

    if (Array.isArray(docs)) {
      for (const doc of docs) {
        const match = doc.document_type.match(/^attendance_attachment:(\d+)$/);
        if (match) {
          const aid = Number(match[1]);
          let meta = {};
          try {
            meta = JSON.parse(doc.admin_remarks || '{}');
          } catch {
            meta = {};
          }
          const { data: publicUrlData } = supabase.storage
            .from('documents')
            .getPublicUrl(doc.file_path);

          map[aid] = normalizeAttachment({
            id: doc.id,
            attendance_id: aid,
            image_url: meta.image_url || publicUrlData?.publicUrl,
            file_name: doc.original_name || doc.file_name,
            original_filename: doc.original_name || doc.file_name,
            mime_type: doc.file_type,
            file_size: doc.file_size,
            storage_path: doc.file_path,
            uploaded_by: meta.uploaded_by || null,
            uploaded_by_name: meta.uploaded_by_name || 'Super Admin',
            uploaded_at: doc.upload_date || doc.created_at,
            updated_at: meta.updated_at || doc.upload_date,
          });
        }
      }
    }
  } catch (fbErr) {
    console.warn('Fallback batch documents query failed:', fbErr.message);
  }

  return map;
}

/**
 * Save or replace an attendance attachment.
 */
export async function saveAttendanceAttachment({ attendanceId, file, user, isReplace = false }) {
  const aid = Number(attendanceId);
  if (!aid) {
    const err = new Error('Valid attendance ID is required');
    err.statusCode = 400;
    throw err;
  }

  // 1. Verify that attendance log exists
  const { data: log, error: logError } = await supabase
    .from('attendance_logs')
    .select('id, intern_id, intern_name, scan_type, scan_time, attendance_record_id')
    .eq('id', aid)
    .maybeSingle();

  if (logError || !log) {
    const err = new Error('Attendance record not found');
    err.statusCode = 404;
    throw err;
  }

  // 2. Validate file (size, MIME, magic bytes)
  validateAttachmentImage(file);

  // 3. Check for existing attachment
  const existing = await getAttendanceAttachment(aid);

  // 4. Upload file to Supabase storage 'documents' bucket
  const cleanFilename = (file.originalname || 'proof.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `attendance_attachments/${aid}_${Date.now()}_${cleanFilename}`;

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, file.buffer, {
      contentType: file.mimetype,
      upsert: true,
    });

  if (uploadError) {
    console.error('Storage upload error:', uploadError);
    throw new Error(`Failed to upload image: ${uploadError.message}`);
  }

  const { data: publicUrlData } = supabase.storage
    .from('documents')
    .getPublicUrl(storagePath);

  const imageUrl = publicUrlData?.publicUrl;
  const now = new Date().toISOString();
  const uploaderName = user?.full_name || user?.username || 'Super Admin';

  const payload = {
    attendance_id: aid,
    image_url: imageUrl,
    file_name: file.originalname || cleanFilename,
    original_filename: file.originalname || cleanFilename,
    mime_type: file.mimetype,
    file_size: file.size,
    storage_path: storagePath,
    uploaded_by: user?.id || null,
    uploaded_by_name: uploaderName,
    uploaded_at: existing?.uploaded_at || now,
    updated_at: now,
  };

  let savedRecord = null;

  // Try saving to attendance_attachments
  try {
    const { data: saved, error: saveErr } = await supabase
      .from('attendance_attachments')
      .upsert(payload, { onConflict: 'attendance_id' })
      .select()
      .single();

    if (!saveErr && saved) {
      savedRecord = saved;
    }
  } catch (err) {
    console.warn('Upsert to attendance_attachments failed:', err.message);
  }

  // Fallback to documents table if needed
  if (!savedRecord) {
    try {
      const docType = `attendance_attachment:${aid}`;
      const docPayload = {
        intern_id: log.intern_id,
        document_type: docType,
        original_name: payload.original_filename,
        file_name: cleanFilename,
        file_type: payload.mime_type,
        file_size: payload.file_size,
        file_path: storagePath,
        upload_date: now,
        status: 'approved',
        admin_remarks: JSON.stringify(payload),
      };

      // Check if existing doc
      const { data: existingDoc } = await supabase
        .from('documents')
        .select('id')
        .eq('document_type', docType)
        .maybeSingle();

      if (existingDoc) {
        await supabase
          .from('documents')
          .update(docPayload)
          .eq('id', existingDoc.id);
      } else {
        await supabase
          .from('documents')
          .insert([docPayload]);
      }
      savedRecord = payload;
    } catch (docErr) {
      console.error('Failed to save to fallback documents table:', docErr);
      throw new Error(`Failed to save attachment metadata: ${docErr.message}`);
    }
  }

  // 5. Clean up old storage file if replaced with a new path
  if (existing?.storage_path && existing.storage_path !== storagePath) {
    try {
      await supabase.storage.from('documents').remove([existing.storage_path]);
    } catch (cleanupErr) {
      console.warn('Failed to clean up old attachment file:', cleanupErr.message);
    }
  }

  // 6. Audit Trail Logging into dtr_edit_history
  const auditAction = isReplace ? 'replaced' : 'uploaded';
  const scanTypeLabel = log.scan_type === 'time_in' ? 'Time In' : 'Time Out';
  console.log(`[AUDIT] Super Admin ${auditAction} attendance image. Attendance ID: ${aid}, Intern: ${log.intern_name || log.intern_id}, Date/Time: ${log.scan_time}, Type: ${scanTypeLabel}`);

  try {
    await supabase.from('dtr_edit_history').insert([{
      attendance_record_id: log.attendance_record_id || null,
      account_id: log.intern_id,
      field_name: 'Attendance Attachment Image',
      original_value: existing ? (existing.file_name || 'Previous Image') : 'None',
      new_value: payload.file_name,
      modified_by: user?.id || null,
      modified_at: now,
      reason: `Super Admin ${auditAction} attendance image for Attendance ID: ${aid} (${scanTypeLabel} on ${log.scan_time})`,
    }]);
  } catch (auditErr) {
    console.warn('Failed to record dtr_edit_history audit log:', auditErr.message);
  }

  return normalizeAttachment(savedRecord || payload);
}

/**
 * Remove an attendance attachment and delete its storage file.
 */
export async function deleteAttendanceAttachment({ attendanceId, user, skipAudit = false }) {
  const aid = Number(attendanceId);
  if (!aid) {
    const err = new Error('Valid attendance ID is required');
    err.statusCode = 400;
    throw err;
  }

  const existing = await getAttendanceAttachment(aid);
  if (!existing) {
    return { success: true, removed: false, message: 'No attachment found for this record' };
  }

  // 1. Remove file from storage
  if (existing.storage_path) {
    try {
      await supabase.storage.from('documents').remove([existing.storage_path]);
    } catch (storageErr) {
      console.warn('Failed to delete file from storage:', storageErr.message);
    }
  }

  // 2. Delete row from attendance_attachments
  try {
    await supabase
      .from('attendance_attachments')
      .delete()
      .eq('attendance_id', aid);
  } catch (tableErr) {
    console.warn('Failed to delete from attendance_attachments:', tableErr.message);
  }

  // 3. Also delete from fallback documents table
  try {
    await supabase
      .from('documents')
      .delete()
      .eq('document_type', `attendance_attachment:${aid}`);
  } catch (docErr) {
    console.warn('Failed to delete from fallback documents table:', docErr.message);
  }

  // 4. Audit trail logging
  if (!skipAudit) {
    let log = null;
    try {
      const { data } = await supabase
        .from('attendance_logs')
        .select('id, intern_id, intern_name, scan_type, scan_time, attendance_record_id')
        .eq('id', aid)
        .maybeSingle();
      log = data;
    } catch {
      log = null;
    }

    const scanTypeLabel = log?.scan_type === 'time_in' ? 'Time In' : 'Time Out';
    console.log(`[AUDIT] Super Admin removed attendance image. Attendance ID: ${aid}, Intern: ${log?.intern_name || 'N/A'}`);

    if (log && log.intern_id) {
      try {
        await supabase.from('dtr_edit_history').insert([{
          attendance_record_id: log.attendance_record_id || null,
          account_id: log.intern_id,
          field_name: 'Attendance Attachment Image',
          original_value: existing.file_name || 'Attached Image',
          new_value: 'Removed',
          modified_by: user?.id || null,
          modified_at: new Date().toISOString(),
          reason: `Super Admin removed attendance image for Attendance ID: ${aid} (${scanTypeLabel} on ${log.scan_time})`,
        }]);
      } catch (auditErr) {
        console.warn('Failed to record dtr_edit_history audit log on removal:', auditErr.message);
      }
    }
  }

  return { success: true, removed: true, message: 'Attendance image removed.' };
}
