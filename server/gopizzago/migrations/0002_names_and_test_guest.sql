-- Nomi della lista WhatsApp e ospite di prova vuoto.
UPDATE ingredients SET name = 'Pomodoro' WHERE id = 'pomodoro';
UPDATE ingredients SET name = 'Zola' WHERE id = 'gorgonzola';
UPDATE ingredients SET name = 'Salamino' WHERE id = 'salamino';
DELETE FROM guests WHERE name = 'TEST agente' AND id NOT IN (SELECT guest_id FROM pizzas);
