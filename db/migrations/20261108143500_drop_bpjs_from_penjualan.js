exports.up = async function (knex) {
  const hasBpjs = await knex.schema.hasColumn('penjualan', 'bpjs');
  if (hasBpjs) {
    await knex.schema.alterTable('penjualan', function (table) {
      table.dropColumn('bpjs');
    });
  }
};

exports.down = async function (knex) {
  const hasBpjs = await knex.schema.hasColumn('penjualan', 'bpjs');
  if (!hasBpjs) {
    await knex.schema.alterTable('penjualan', function (table) {
      table.bigInteger('bpjs').defaultTo(0);
    });
  }
};
