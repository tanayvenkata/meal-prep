alter table "private"."pantry_operation_receipts" drop constraint "pantry_operation_receipts_kind_check";

alter table "private"."pantry_operation_receipts" add constraint "pantry_operation_receipts_kind_check" CHECK ((operation_kind = ANY (ARRAY['reviewed_receipt_import'::text, 'add_items'::text, 'edit_items'::text, 'remove_items'::text]))) not valid;

alter table "private"."pantry_operation_receipts" validate constraint "pantry_operation_receipts_kind_check";


