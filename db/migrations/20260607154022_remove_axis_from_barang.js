exports.up = async function(knex) {
  const hasAxisL = await knex.schema.hasColumn('barang', 'axis_l');
  const hasAxisR = await knex.schema.hasColumn('barang', 'axis_r');
  if (hasAxisL || hasAxisR) {
    await knex.schema.alterTable('barang', function(table) {
      if (hasAxisL) table.dropColumn('axis_l');
      if (hasAxisR) table.dropColumn('axis_r');
    });
  }
};

exports.down = async function(knex) {
  const hasAxisL = await knex.schema.hasColumn('barang', 'axis_l');
  const hasAxisR = await knex.schema.hasColumn('barang', 'axis_r');
  if (!hasAxisL || !hasAxisR) {
    await knex.schema.alterTable('barang', function(table) {
      if (!hasAxisL) table.string('axis_l', 20);
      if (!hasAxisR) table.string('axis_r', 20);
    });
  }
};
